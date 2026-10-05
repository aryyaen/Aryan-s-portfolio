import {
  Scene, PerspectiveCamera, WebGLRenderer, AmbientLight, DirectionalLight,
  Vector3, Vector2, Quaternion, TextureLoader, RepeatWrapping,
  BufferGeometry, BufferAttribute, MeshBasicMaterial, Mesh, Group,
  DoubleSide, Raycaster, Plane, Box3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * A hanging ID-card-on-a-lanyard, built with plain three.js.
 * The band is a simple verlet rope (mass-spring chain) rendered as a
 * textured ribbon; the card is a rigid body attached to its free end.
 * Drag the card with the mouse/touch and it swings and settles naturally.
 *
 * Tunable constants are grouped at the top — nudge these to taste once
 * you can see it live rather than reading the physics below.
 */

const CONFIG = {
  modelUrl: 'assets/kartu.glb',
  bandTextureUrl: 'assets/bandd.png',
  ropeSegments: 10,
  ropeLength: 2.2,
  anchor: new Vector3(0, 3.4, 0),
  bandWidth: 0.18,
  gravity: -9.8,
  damping: 0.985, // closer to 1 = less energy loss per step
  stiffnessIterations: 6,
  cardScale: 3.6,
  // Exact horizontal center of the card/clip in the source GLB. Keeping the
  // rope endpoint and card origin on this same x coordinate prevents a
  // sideways offset between the band, hook, and card.
  clipRing: new Vector3(-0.1741259545, 1.14, 0.4368237555),
  // Phones (<= this width) get a stacked layout: the card hangs above the intro text.
  compactMaxWidth: 640,
  // How much of the world (in three.js units) the stage shows top-to-bottom.
  // Desktop = the original framing. Compact zooms in so the card is a good size.
  compactViewHeight: 6.8,
  // On phones the canvas is drawn this much taller than the stage (fraction of its
  // height) so a dragged/swinging card isn't sliced off at the stage's bottom edge.
  compactOverflow: 0.5,
};

const CAMERA_Z = 14;
// Visible world height at the original 30-degree field of view (desktop framing).
const DESKTOP_VIEW_HEIGHT = 2 * CAMERA_Z * Math.tan((15 * Math.PI) / 180);

export function initIdCard(containerEl) {
  const mqCompact = window.matchMedia(`(max-width: ${CONFIG.compactMaxWidth}px)`);
  const mqTouch = window.matchMedia('(pointer: coarse)');

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, CAMERA_Z);

  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  containerEl.appendChild(renderer.domElement);

  scene.add(new AmbientLight(0xffffff, Math.PI));
  const key = new DirectionalLight(0xffffff, 3);
  key.position.set(2, 4, 5);
  scene.add(key);
  const fill = new DirectionalLight(0xffffff, 1.5);
  fill.position.set(-3, -1, 2);
  scene.add(fill);

  /* ---------------- rope (verlet integration) ---------------- */
  const N = CONFIG.ropeSegments;
  const segLen = CONFIG.ropeLength / (N - 1);
  const points = [];
  const prevPoints = [];
  for (let i = 0; i < N; i++) {
    const p = CONFIG.anchor.clone().add(new Vector3(0, -i * segLen, 0));
    points.push(p);
    prevPoints.push(p.clone());
  }

  const bandTexture = new TextureLoader().load(CONFIG.bandTextureUrl);
  bandTexture.wrapS = RepeatWrapping;
  bandTexture.wrapT = RepeatWrapping;

  const bandGeometry = new BufferGeometry();
  const bandPositions = new Float32Array(N * 2 * 3);
  const bandUVs = new Float32Array(N * 2 * 2);
  const bandIndices = [];
  for (let i = 0; i < N - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    bandIndices.push(a, b, c, b, d, c);
  }
  bandGeometry.setAttribute('position', new BufferAttribute(bandPositions, 3));
  bandGeometry.setAttribute('uv', new BufferAttribute(bandUVs, 2));
  bandGeometry.setIndex(bandIndices);
  const bandMaterial = new MeshBasicMaterial({
    map: bandTexture,
    side: DoubleSide,
    transparent: true,
  });
  const bandMesh = new Mesh(bandGeometry, bandMaterial);
  scene.add(bandMesh);

  function updateBandMesh() {
    const half = CONFIG.bandWidth / 2;
    for (let i = 0; i < N; i++) {
      const p = points[i];
      bandPositions[i * 6 + 0] = p.x - half;
      bandPositions[i * 6 + 1] = p.y;
      bandPositions[i * 6 + 2] = p.z;
      bandPositions[i * 6 + 3] = p.x + half;
      bandPositions[i * 6 + 4] = p.y;
      bandPositions[i * 6 + 5] = p.z;

      const v = i / (N - 1);
      bandUVs[i * 4 + 0] = 0;
      bandUVs[i * 4 + 1] = v * 4;
      bandUVs[i * 4 + 2] = 1;
      bandUVs[i * 4 + 3] = v * 4;
    }
    bandGeometry.attributes.position.needsUpdate = true;
    bandGeometry.attributes.uv.needsUpdate = true;
    bandGeometry.computeVertexNormals();
  }
  updateBandMesh();

  /* ---------------- card model ---------------- */
  const cardGroup = new Group();
  cardGroup.scale.setScalar(CONFIG.cardScale);
  scene.add(cardGroup);

  let cardHitMesh = null; // used for drag raycasting
  let cardBounds = null;  // card centre/size relative to the clip ring (for the touch grab zone)

  new GLTFLoader().load(CONFIG.modelUrl, (gltf) => {
    const model = gltf.scene;
    // The source file bakes an offset into each node, so shift the model until
    // the clip ring sits exactly on the group's origin (= the rope's end).
    model.position.copy(CONFIG.clipRing).negate();
    cardGroup.add(model);
    model.traverse((child) => {
      if (child.isMesh && !cardHitMesh) cardHitMesh = child;
      // keep the photo crisp when the card tilts or swings (texture is sampled at an angle)
      if (child.isMesh && child.material && child.material.map) {
        child.material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      }
    });

    // Measure the card with the group at rest (ring at the origin, no rotation).
    const savedPos = cardGroup.position.clone();
    const savedQuat = cardGroup.quaternion.clone();
    cardGroup.position.set(0, 0, 0);
    cardGroup.quaternion.identity();
    cardGroup.updateMatrixWorld(true);
    const box = new Box3().setFromObject(model);
    cardBounds = { center: box.getCenter(new Vector3()), size: box.getSize(new Vector3()) };
    cardGroup.position.copy(savedPos);
    cardGroup.quaternion.copy(savedQuat);
    cardGroup.updateMatrixWorld(true);
    sizeGrabZone();
  });

  /* ---------------- touch grab zone ----------------
     On touch screens the stage must NOT swallow swipes, or the page couldn't be
     scrolled past the hero. Instead a small invisible zone follows the card; only
     touches that start on it are "ours" (touch-action: none there), everything
     else scrolls normally. Mouse users never see it (hidden via CSS). */
  const grab = document.createElement('div');
  grab.className = 'id-card-grab';
  containerEl.appendChild(grab);
  const grabTmp = new Vector3();
  let pxPerUnit = 100;
  let canvasW = 1;
  let canvasH = 1;
  let grabW = 0;
  let grabH = 0;

  function sizeGrabZone() {
    if (!cardBounds) return;
    grabW = Math.round(cardBounds.size.x * pxPerUnit * 1.15);
    grabH = Math.round(cardBounds.size.y * pxPerUnit * 1.05);
    grab.style.width = `${grabW}px`;
    grab.style.height = `${grabH}px`;
  }

  function updateGrabZone() {
    if (!cardBounds || !mqTouch.matches) return;
    grabTmp.copy(cardBounds.center).applyQuaternion(cardGroup.quaternion).add(cardGroup.position);
    grabTmp.project(camera);
    const x = (grabTmp.x * 0.5 + 0.5) * canvasW + renderer.domElement.offsetLeft - grabW / 2;
    const y = (-grabTmp.y * 0.5 + 0.5) * canvasH - grabH / 2;
    grab.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }

  /* ---------------- interaction ---------------- */
  let dragging = false;
  const raycaster = new Raycaster();
  const pointerNDC = new Vector2();
  const dragPlane = new Plane();
  const dragPoint = new Vector3();

  function setPointerFromEvent(evt) {
    const rect = renderer.domElement.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  function onPointerDown(evt) {
    setPointerFromEvent(evt);
    raycaster.setFromCamera(pointerNDC, camera);
    if (!cardHitMesh) return;
    const hit = raycaster.intersectObject(cardHitMesh, true);
    if (hit.length) {
      dragging = true;
      dragPlane.setFromNormalAndCoplanarPoint(
        camera.getWorldDirection(new Vector3()).negate(),
        points[N - 1]
      );
      containerEl.style.cursor = 'grabbing';
    }
  }

  function onPointerMove(evt) {
    if (!dragging) return;
    setPointerFromEvent(evt);
    raycaster.setFromCamera(pointerNDC, camera);
    raycaster.ray.intersectPlane(dragPlane, dragPoint);
    // Directly set the free end's position; NOT updating prevPoints
    // for it lets verlet infer a release velocity naturally on drop.
    points[N - 1].copy(dragPoint);
  }

  function onPointerUp() {
    dragging = false;
    containerEl.style.cursor = 'grab';
  }

  // Dragging the card across the page must not highlight the text behind it.
  window.addEventListener('selectstart', (evt) => { if (dragging) evt.preventDefault(); });

  containerEl.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  containerEl.style.cursor = 'grab';

  /* ---------------- resize ---------------- */
  // Desktop: the container (and its grab area) is the hero's right half, but the
  // canvas is drawn twice as wide, extending left over the hero, so the card never
  // gets sliced off when it swings past the middle of the page.
  // Phones: the container is a full-width block above the text; the canvas is the
  // same width but extends a bit below it. In both cases a camera view offset keeps
  // the lanyard anchored exactly at the top of the container.
  function resize() {
    const compact = mqCompact.matches;
    containerEl.classList.toggle('is-compact', compact);

    const w = containerEl.clientWidth;
    const h = containerEl.clientHeight;
    if (!w || !h) return;

    const viewHeight = compact ? CONFIG.compactViewHeight : DESKTOP_VIEW_HEIGHT;
    camera.fov = (2 * Math.atan(viewHeight / 2 / CAMERA_Z) * 180) / Math.PI;
    camera.position.y = DESKTOP_VIEW_HEIGHT / 2 - viewHeight / 2; // keep the top edge fixed
    camera.aspect = w / h;

    const canvas = renderer.domElement;
    if (compact) {
      canvasW = w;
      canvasH = h + Math.round(h * CONFIG.compactOverflow);
      canvas.style.width = `${canvasW}px`;
      canvas.style.height = `${canvasH}px`;
      renderer.setSize(canvasW, canvasH, false);
      camera.setViewOffset(w, h, 0, 0, canvasW, canvasH);
    } else {
      canvasW = w * 2;
      canvasH = h;
      canvas.style.width = '';   // back to the stylesheet (200% wide)
      canvas.style.height = '';
      renderer.setSize(canvasW, canvasH, false);
      camera.setViewOffset(w, h, -w, 0, canvasW, canvasH);
    }
    camera.updateProjectionMatrix();

    pxPerUnit = h / viewHeight;
    sizeGrabZone();
  }
  window.addEventListener('resize', resize);
  resize();

  /* ---------------- animation loop ---------------- */
  const gravityVec = new Vector3(0, CONFIG.gravity, 0);
  let lastTime = performance.now();

  function step(dt) {
    // integrate
    for (let i = 1; i < N; i++) {
      if (dragging && i === N - 1) continue; // driven directly by pointer
      const p = points[i];
      const prev = prevPoints[i];
      const velocity = p.clone().sub(prev).multiplyScalar(CONFIG.damping);
      prevPoints[i].copy(p);
      p.add(velocity).add(gravityVec.clone().multiplyScalar(dt * dt));
    }
    points[0].copy(CONFIG.anchor); // anchor stays fixed
    prevPoints[0].copy(CONFIG.anchor);

    // distance constraints (Verlet/PBD relaxation)
    for (let iter = 0; iter < CONFIG.stiffnessIterations; iter++) {
      for (let i = 0; i < N - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const delta = b.clone().sub(a);
        const dist = delta.length() || 0.0001;
        const diff = (dist - segLen) / dist;
        const offset = delta.multiplyScalar(0.5 * diff);
        if (i !== 0) a.add(offset);
        if (!(dragging && i + 1 === N - 1)) b.sub(offset);
      }
      points[0].copy(CONFIG.anchor);
    }

    updateBandMesh();

    // orient + position the card from the rope's last segment
    const end = points[N - 1];
    const prevEnd = points[N - 2];
    cardGroup.position.copy(end);
    const dir = end.clone().sub(prevEnd).normalize();
    const up = new Vector3(0, 1, 0);
    const quat = new Quaternion().setFromUnitVectors(up, dir.negate());
    cardGroup.quaternion.slerp(quat, 0.35);
  }

  // Only simulate/render while the hero is on screen (saves battery on phones).
  let raf = 0;
  let onScreen = true;

  function animate(now) {
    raf = 0;
    if (!onScreen) return;
    const dt = Math.min((now - lastTime) / 1000, 1 / 30);
    lastTime = now;
    step(dt);
    updateGrabZone();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(animate);
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen && !raf) {
        lastTime = performance.now();
        raf = requestAnimationFrame(animate);
      }
    }).observe(containerEl);
  }
  raf = requestAnimationFrame(animate);
}

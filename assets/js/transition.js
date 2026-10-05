import {
  Scene, OrthographicCamera, WebGLRenderer, ShaderMaterial,
  PlaneGeometry, Mesh, Color, Vector2,
} from 'three';

/**
 * Shader section transition (vanilla port of the Next.js "Shader-Transition").
 *
 * One animated number, `progress`, drives everything:
 *   0 → 0.5   noise wipe sweeps up and covers the screen
 *   0.5       fully covered  -> we jump to the target section (invisible)
 *   0.5 → 1   trailing edge sweeps up and reveals the new section
 *
 * Only renders while a transition is playing, so it costs nothing at idle.
 * If WebGL is unavailable or the user prefers reduced motion, it does nothing
 * and the browser's normal smooth anchor scrolling is used instead.
 */

const CONFIG = {
  duration: 1.7,            // seconds for the whole journey
  colorA: '#16161a',        // body of the wipe
  colorB: '#e4e4e7',        // bright feathered edge
  maxPixelRatio: 1,            // the wipe is soft noise, so full DPR would only cost GPU time
};

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform float uProgress;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uRadial;   // 0 = sweep upward (nav), 1 = expand from uOrigin (entrance)
  uniform vec2 uOrigin;
  uniform float uAspect;
  uniform float uMaxDist;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.0 + vec2(13.7, 9.1);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 p = vUv * 3.0;
    float t = uProgress * 3.14;

    vec2 warp = vec2(
      fbm(p + vec2(0.0, t * 0.2)),
      fbm(p + vec2(5.2, 1.3) - vec2(t * 0.15, 0.0))
    );
    float w = fbm(p + 0.9 * warp);

    float waves = sin(vUv.x * 6.0 + t) * 0.03 + sin(vUv.x * 13.0 - t) * 0.012;
    float radial = length((vUv - uOrigin) * vec2(uAspect, 1.0)) / uMaxDist;
    float base = mix(vUv.y, radial, uRadial);
    float wipe = base + (w - 0.5) * 0.3 + waves;

    float coverP = smoothstep(0.0, 0.55, uProgress);
    float clearP = smoothstep(0.45, 1.0, uProgress);
    float frontPos = coverP * 2.2 - 0.35;
    float backPos = clearP * 2.2 - 0.35;
    float covered = smoothstep(wipe - 0.1, wipe + 0.1, frontPos);
    float cleared = smoothstep(wipe - 0.1, wipe + 0.1, backPos);
    float band = covered - cleared;

    float dEdge = min(frontPos - wipe, wipe - backPos);
    float body = smoothstep(0.05, 0.6, dEdge);
    float hide = 1.0 - smoothstep(0.08, 0.18, abs(uProgress - 0.5));
    float alpha = band * mix(0.3, 1.0, max(body, hide));

    float tint = clamp(1.0 - body + (w - 0.5) * 0.4, 0.0, 1.0);
    // entrance (radial) uses a calmer highlight than the nav sweep
    vec3 edgeCol = mix(uColorB, vec3(0.42, 0.42, 0.46), uRadial * 0.7);
    vec3 color = mix(uColorA, edgeCol, tint);
    color += 0.03 * sin(w * 8.0 + t); // neutral shimmer (keeps the monochrome look)

    float frontGlow = 1.0 - smoothstep(0.0, 0.25, abs(frontPos - wipe));
    float backGlow = 1.0 - smoothstep(0.0, 0.25, abs(backPos - wipe));
    color += (frontGlow + backGlow) * mix(0.12, 0.07, uRadial);

    gl_FragColor = vec4(color, alpha);
  }
`;

export function initShaderTransition() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- renderer (bail out quietly if WebGL isn't available) ---------- */
  let renderer;
  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
  } catch (err) {
    console.warn('[transition] WebGL unavailable, using normal scrolling.', err);
    return;
  }

  const canvas = renderer.domElement;
  canvas.className = 'shader-transition';
  canvas.setAttribute('aria-hidden', 'true');
  renderer.setClearColor(0x000000, 0);
  document.body.appendChild(canvas);

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1); // unused by the shader, required by render()

  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uProgress: { value: 0 },
      uColorA: { value: new Color(CONFIG.colorA) },
      uColorB: { value: new Color(CONFIG.colorB) },
      uRadial: { value: 0 },
      uOrigin: { value: new Vector2(0.5, 0.5) },
      uAspect: { value: 1 },
      uMaxDist: { value: 1 },
    },
  });
  const mesh = new Mesh(new PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  function resize() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight, false); // CSS controls display size
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  /* ---------- playback ---------- */
  let busy = false;

  function setProgress(value) {
    material.uniforms.uProgress.value = value;
    renderer.render(scene, camera);
  }

  function finish() {
    material.uniforms.uProgress.value = 0;
    material.uniforms.uRadial.value = 0; // back to the nav's upward sweep
    renderer.clear();
    canvas.classList.remove('is-active');
    busy = false;
  }

  /**
   * Plays the whole transition and calls `swap` once, while the screen is
   * fully covered. Always completes, even if animation frames stall.
   */
  function play(swap) {
    busy = true;
    resize();
    canvas.classList.add('is-active');

    const total = CONFIG.duration * 1000;
    const start = performance.now();
    let swapped = false;
    let done = false;

    const doSwap = () => {
      if (swapped) return;
      swapped = true;
      try { swap(); } catch (err) { console.error('[transition] swap failed', err); }
    };

    const end = () => {
      if (done) return;
      done = true;
      clearTimeout(safety);
      doSwap();
      finish();
    };

    // Safety net: if rAF is throttled/paused (background tab), still land on the target.
    const safety = setTimeout(end, total + 600);

    const frame = (now) => {
      if (done) return;
      const p = Math.min((now - start) / total, 1);
      if (p >= 0.5) doSwap();
      if (p >= 1) { end(); return; }
      setProgress(p);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /* ---------- section navigation ---------- */
  function scrollToTarget(hash) {
    const id = decodeURIComponent(hash.slice(1));
    const target = id ? document.getElementById(id) : null;
    const top = !id || id === 'home' || !target
      ? 0
      : target.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top, left: 0, behavior: 'instant' }); // 'instant' beats CSS scroll-behavior:smooth
    if (target) {
      if (history.pushState && location.hash !== hash) history.pushState(null, '', hash);
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  }

  /**
   * Entrance: same wipe, but expanding outward from a screen point
   * (the OPEN word) instead of sweeping upward. `origin` is in CSS pixels.
   */
  function playFrom(origin, swap) {
    if (busy) return false;
    const w = window.innerWidth, h = window.innerHeight;
    const ox = origin.x / w, oy = 1 - origin.y / h;
    const aspect = w / h;
    const far = Math.max(
      Math.hypot(ox * aspect, oy), Math.hypot((1 - ox) * aspect, oy),
      Math.hypot(ox * aspect, 1 - oy), Math.hypot((1 - ox) * aspect, 1 - oy)
    );
    const u = material.uniforms;
    u.uRadial.value = 1;
    u.uOrigin.value.set(ox, oy);
    u.uAspect.value = aspect;
    u.uMaxDist.value = far;
    play(swap);
    return true;
  }

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const link = event.target.closest && event.target.closest('a[href^="#"]');
    if (!link) return;

    const hash = link.getAttribute('href');
    if (!hash || hash === '#') return;
    const id = decodeURIComponent(hash.slice(1));
    if (id && id !== 'home' && !document.getElementById(id)) return; // not ours, leave it alone

    // Normal smooth scrolling when motion is reduced or the tab can't animate.
    if (reduceMotion.matches || document.hidden) return;

    event.preventDefault();
    if (busy) return; // ignore clicks while a transition is already playing

    play(() => scrollToTarget(hash));
  });

  return { playFrom };
}

const canvas = document.getElementById('galaxyCanvas');

if (canvas) {
  const ctx = canvas.getContext('2d', { alpha: true });
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = { x: 0.5, y: 0.45, targetX: 0.5, targetY: 0.45, active: false };
  const layers = [];
  const shiningStars = [];
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let animationFrame;
  let lastTime = performance.now();

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const random = (min, max) => min + Math.random() * (max - min);

  // Background star (small, drifting dots)
  function makeStar(layer, index) {
    const size = layer === 0 ? random(0.25, 0.8) : layer === 1 ? random(0.45, 1.15) : random(0.7, 1.7);
    return {
      x: Math.random(),
      y: Math.random(),
      size,
      alpha: layer === 0 ? random(0.15, 0.42) : layer === 1 ? random(0.2, 0.6) : random(0.28, 0.72),
      drift: random(-0.002, 0.002),
      phase: random(0, Math.PI * 2),
      hue: index % 7 === 0 ? 210 : 0,
    };
  }

  // Shining sparkle star (larger, with cross-glow halo)
  function makeShining() {
    const depth = random(0.4, 1);
    const palette = [
      [255, 255, 255],   // pure white
      [200, 220, 255],   // cool blue-white
      [255, 240, 200],   // warm gold
      [210, 200, 255],   // soft lavender
      [180, 230, 255],   // ice blue
    ];
    const [r, g, b] = palette[Math.floor(Math.random() * palette.length)];
    return {
      x: random(0.03, 0.97),
      y: random(0.03, 0.97),
      baseX: 0,
      baseY: 0,
      coreRadius: random(0.8, 2.2) * depth,
      glowRadius: random(6, 22) * depth,
      armLength: random(8, 32) * depth,
      depth,
      alpha: random(0.5, 0.95),
      phase: random(0, Math.PI * 2),
      phaseSpeed: random(0.0004, 0.0012),
      vx: random(-0.000012, 0.000012),
      vy: random(-0.000018, 0.000018),
      r, g, b,
    };
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    pixelRatio = Math.min(window.devicePixelRatio || 1, width < 700 ? 1.25 : 1.7);
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const area = width * height;
    const mobile = width < 700;
    const tablet = width < 1050;
    const counts = mobile
      ? [Math.round(area / 26000), Math.round(area / 40000), 8]
      : tablet
        ? [Math.round(area / 18000), Math.round(area / 30000), 16]
        : [Math.round(area / 12000), Math.round(area / 22000), 30];

    layers.length = 0;
    for (let layer = 0; layer < 3; layer++) {
      const count = clamp(counts[layer], layer === 2 ? 8 : 14, layer === 0 ? 150 : layer === 1 ? 100 : 45);
      layers.push(Array.from({ length: count }, (_, index) => makeStar(layer, index)));
    }

    shiningStars.length = 0;
    const shineCount = mobile ? 6 : tablet ? 11 : 18;
    for (let i = 0; i < shineCount; i++) {
      const s = makeShining();
      s.baseX = s.x;
      s.baseY = s.y;
      shiningStars.push(s);
    }
  }

  function updatePointer(clientX, clientY) {
    pointer.targetX = clamp(clientX / width, 0, 1);
    pointer.targetY = clamp(clientY / height, 0, 1);
    pointer.active = true;
  }

  window.addEventListener('pointermove', (event) => updatePointer(event.clientX, event.clientY), { passive: true });
  window.addEventListener('pointerleave', () => { pointer.active = false; }, { passive: true });
  window.addEventListener('touchmove', (event) => {
    if (event.touches[0]) updatePointer(event.touches[0].clientX, event.touches[0].clientY);
  }, { passive: true });
  window.addEventListener('resize', resize, { passive: true });

  function drawNebula(time) {
    const glow = ctx.createRadialGradient(width * 0.76, height * 0.2, 0, width * 0.76, height * 0.2, width * 0.48);
    glow.addColorStop(0, 'rgba(91, 111, 145, 0.035)');
    glow.addColorStop(0.46, 'rgba(54, 62, 82, 0.018)');
    glow.addColorStop(1, 'rgba(10, 10, 11, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    const hazeX = width * (0.23 + Math.sin(time * 0.000035) * 0.04);
    const hazeY = height * 0.68;
    const haze = ctx.createRadialGradient(hazeX, hazeY, 0, hazeX, hazeY, width * 0.38);
    haze.addColorStop(0, 'rgba(120, 128, 145, 0.022)');
    haze.addColorStop(1, 'rgba(10, 10, 11, 0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, width, height);
  }

  function drawStars(time) {
    layers.forEach((stars, layerIndex) => {
      const parallax = [0.006, 0.014, 0.026][layerIndex];
      const speed = [0.000006, 0.000012, 0.000022][layerIndex];
      stars.forEach((star) => {
        star.y = (star.y + speed) % 1;
        star.x = (star.x + star.drift * 0.00008) % 1;
        const x = star.x * width + (pointer.x - 0.5) * width * parallax;
        const y = star.y * height + (pointer.y - 0.45) * height * parallax;
        const twinkle = 0.78 + Math.sin(time * 0.001 * (0.5 + layerIndex * 0.3) + star.phase) * 0.22;
        const alpha = star.alpha * twinkle;
        ctx.fillStyle = star.hue ? `rgba(180, 202, 230, ${alpha})` : `rgba(235, 238, 245, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, star.size * (layerIndex === 2 ? 1.1 : 1), 0, Math.PI * 2);
        ctx.fill();
      });
    });
  }

  // Draw a 4-point cross sparkle glow (the "shining star" effect)
  function drawSparkle(x, y, coreR, glowR, armLen, alpha, r, g, b) {
    // Soft radial halo
    const halo = ctx.createRadialGradient(x, y, 0, x, y, glowR);
    halo.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.55})`);
    halo.addColorStop(0.4, `rgba(${r},${g},${b},${alpha * 0.18})`);
    halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, glowR, 0, Math.PI * 2);
    ctx.fill();

    // 4-point cross arms (horizontal + vertical light streaks)
    const crossAlpha = alpha * 0.5;
    for (let angle = 0; angle < Math.PI; angle += Math.PI / 2) {
      const grad = ctx.createLinearGradient(
        x + Math.cos(angle) * armLen, y + Math.sin(angle) * armLen,
        x + Math.cos(angle + Math.PI) * armLen, y + Math.sin(angle + Math.PI) * armLen
      );
      grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
      grad.addColorStop(0.5, `rgba(${r},${g},${b},${crossAlpha})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(0.5, coreR * 0.7);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * armLen, y + Math.sin(angle) * armLen);
      ctx.lineTo(x + Math.cos(angle + Math.PI) * armLen, y + Math.sin(angle + Math.PI) * armLen);
      ctx.stroke();
    }

    // Bright core dot
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, coreR, 0, Math.PI * 2);
    ctx.fill();
  }

  function updateAndDrawShining(time, delta) {
    shiningStars.forEach((s) => {
      s.phase += s.phaseSpeed * delta;
      s.baseX += s.vx * delta;
      s.baseY += s.vy * delta;
      if (s.baseX < -0.06) s.baseX = 1.06;
      if (s.baseX > 1.06) s.baseX = -0.06;
      if (s.baseY < -0.06) s.baseY = 1.06;
      if (s.baseY > 1.06) s.baseY = -0.06;

      s.x += (s.baseX - s.x) * 0.018;
      s.y += (s.baseY - s.y) * 0.018;

      const x = s.x * width + (pointer.x - 0.5) * width * 0.03 * s.depth;
      const y = s.y * height + (pointer.y - 0.45) * height * 0.03 * s.depth;

      // Smooth twinkle: alpha pulses between ~30% and 100% of base
      const twinkle = 0.65 + Math.sin(s.phase) * 0.35;
      const alpha = s.alpha * twinkle;

      // Arm length also pulses slightly
      const armPulse = s.armLength * (0.85 + Math.sin(s.phase * 1.3) * 0.15);
      const glowPulse = s.glowRadius * (0.9 + Math.sin(s.phase * 0.7) * 0.1);

      drawSparkle(x, y, s.coreRadius, glowPulse, armPulse, alpha, s.r, s.g, s.b);
    });
  }

  function draw(time) {
    const delta = Math.min(time - lastTime, 40);
    lastTime = time;
    pointer.x += (pointer.targetX - pointer.x) * 0.035;
    pointer.y += (pointer.targetY - pointer.y) * 0.035;
    ctx.clearRect(0, 0, width, height);
    drawNebula(time);
    drawStars(time);
    updateAndDrawShining(time, delta);
    if (!reduceMotion.matches) animationFrame = requestAnimationFrame(draw);
  }

  resize();
  draw(performance.now());

  reduceMotion.addEventListener?.('change', () => {
    cancelAnimationFrame(animationFrame);
    lastTime = performance.now();
    draw(lastTime);
  });
}

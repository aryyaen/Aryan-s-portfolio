/**
 * Cinematic front door: a minimal OPEN screen that hands off to the existing
 * shader transition (same wipe as the navbar), expanding from the OPEN word.
 *
 * Costs nothing at idle: hover feedback is event-driven (one rAF per pointer
 * move at most, writing CSS variables) and all motion is CSS transform/opacity.
 */
export function initIntro(transition) {
  const root = document.documentElement;
  const intro = document.getElementById('intro');
  const button = document.getElementById('introOpen');

  // Nothing to show (or the markup is missing): make sure the site is usable.
  if (!intro || !button || !root.classList.contains('intro-active')) {
    window.__introReady = true;
    return;
  }
  window.__introReady = true;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  // Keep the page behind the intro out of the tab order / screen readers.
  const behind = [document.querySelector('.navbar'), document.querySelector('main')].filter(Boolean);
  behind.forEach((el) => { el.inert = true; });

  button.focus({ preventScroll: true });

  /* ---------- magnetic hover (mouse only, event-driven, no loop) ---------- */
  const REACH = 280;       // px from the word where it starts to respond
  const PULL = 0.16;       // how far it drifts toward the cursor
  const MAX_SHIFT = 14;    // hard cap in px
  let queued = null;
  let frame = 0;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function apply() {
    frame = 0;
    if (!queued) return;
    const { x, y } = queued;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const dx = x - cx;
    const dy = y - cy;
    const t = clamp(1 - Math.hypot(dx, dy) / REACH, 0, 1);
    const prox = t * t * (3 - 2 * t); // smoothstep

    const s = intro.style;
    s.setProperty('--prox', prox.toFixed(3));
    s.setProperty('--tx', `${clamp(dx * PULL * prox, -MAX_SHIFT, MAX_SHIFT).toFixed(2)}px`);
    s.setProperty('--ty', `${clamp(dy * PULL * prox, -MAX_SHIFT, MAX_SHIFT).toFixed(2)}px`);
    s.setProperty('--s', (1 + 0.035 * prox).toFixed(4));
    // background parallax + ambient light drifting a little toward the cursor
    s.setProperty('--mx', (dx / cx).toFixed(3));
    s.setProperty('--my', (dy / cy).toFixed(3));
    s.setProperty('--gx', `${(dx * 0.22).toFixed(1)}px`);
    s.setProperty('--gy', `${(dy * 0.22).toFixed(1)}px`);
  }

  function schedule(point) {
    queued = point;
    if (!frame) frame = requestAnimationFrame(apply);
  }

  function rest() {
    schedule({ x: window.innerWidth / 2, y: window.innerHeight / 2 + REACH * 2 });
  }

  function onMove(event) {
    if (event.pointerType !== 'mouse' || !finePointer.matches || reduceMotion.matches) return;
    schedule({ x: event.clientX, y: event.clientY });
  }

  intro.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', rest, { passive: true });

  /* ---------- entering ---------- */
  let entering = false;

  function finish() {
    if (!root.classList.contains('intro-active')) return;
    root.classList.remove('intro-active');
    behind.forEach((el) => { el.inert = false; });
    intro.removeEventListener('pointermove', onMove);
    document.documentElement.removeEventListener('pointerleave', rest);
    if (frame) cancelAnimationFrame(frame);
    intro.remove();
    window.dispatchEvent(new Event('intro:done')); // lets the hero's reveal animations play now
  }

  function enter() {
    if (entering) return;
    entering = true;

    const rect = button.getBoundingClientRect();
    const origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

    intro.classList.add('is-entering');                       // OPEN compresses, background starts to move
    setTimeout(() => intro.classList.add('is-leaving'), 170); // OPEN releases and dissolves into the wipe

    const wipe = !reduceMotion.matches && transition && transition.playFrom(origin, finish);
    if (!wipe) {
      // Reduced motion / no WebGL: a short, simple cross-fade instead.
      intro.classList.add('is-fading');
      setTimeout(finish, reduceMotion.matches ? 350 : 600);
    }
  }

  button.addEventListener('click', enter);
}

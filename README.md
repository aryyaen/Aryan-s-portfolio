# Aryan Ahirwar — Portfolio

Plain static frontend (`index.html`, `styles.css`, `script.js`) plus a small
Express backend (`backend/`) that powers the Comments section.

## Run it locally

1. Start the backend:
   ```bash
   cd backend
   npm install
   npm start
   ```
   This runs the API at `http://localhost:4000`.

2. Open `index.html` in a browser (or serve it with any static server, e.g.
   `npx serve .`). The frontend is already pointed at `http://localhost:4000`
   via the `API_BASE` constant near the top of the comments code in
   `script.js` — change that constant once the backend is deployed somewhere
   real.

## Deploying

- **Frontend**: any static host works (Netlify, Vercel, GitHub Pages, your
  own VPS). It's plain HTML/CSS/JS — nothing to build.
- **Backend**: see `backend/README.md` — it needs a host with a persistent
  filesystem, since comments and uploaded images are saved to disk.

## Go-live checklist

1. **Upload only the frontend files** to your static host: `index.html`,
   `styles.css`, `script.js` and the `assets/` folder. Don't publish `backend/`
   there — it's a separate Node app (and has no place on a static host).
2. **Comments:** until the backend is deployed, the live site shows a polite
   "comments are taking a short break" message (no errors). When it's live,
   set `PROD_API_BASE` near the top of the comments code in `script.js` to the
   backend's HTTPS URL, and set `ALLOWED_ORIGINS=https://aryanhere.com` on the
   backend (add the `www.` version too if you use it).
3. Serve the site over HTTPS (all common hosts do this automatically).
4. After uploading, hard-refresh and click through OPEN → each nav link.

## What's here vs. what isn't

- The résumé download button from the original build has been removed
  entirely.
- The Comments section is now backed by a real API instead of being
  decorative.
- The hanging 3D ID card (`assets/kartu.glb` + `assets/bandd.png`) is back in
  the hero. It's plain three.js (vendored in `assets/vendor/three`, no CDN, no
  build step) with a small rope simulation — drag the card and it swings.
  Tweak position/size/rope length in the `CONFIG` block at the top of
  `assets/js/idcard.js`. On phones (<= 640px) the layout stacks: the card hangs
  from behind the navbar above the intro text (framing is `compactViewHeight` in
  the same `CONFIG`). On touch screens only the card itself captures touches, so
  the page still scrolls normally everywhere else. The card stops rendering while
  it's scrolled off-screen.

- **Shader section transition** (`assets/js/transition.js`): clicking Home /
  Portfolio / Contact (or the AA. logo) plays a WebGL noise wipe that covers
  the screen, jumps to the section while hidden, then reveals it. Ported from
  the Next.js "Shader-Transition" demo to plain three.js (already vendored) —
  no React, GSAP or build step. Tweak duration and colours in `CONFIG` at the
  top of the file. It only renders during a transition, never blocks clicks,
  and falls back to normal smooth scrolling if WebGL is unavailable or the
  visitor has reduced-motion enabled.

- **Entrance / OPEN screen** (`assets/js/intro.js`, markup at the top of
  `<body>` in `index.html`, styles at the bottom of `styles.css`): every fresh
  load starts on a minimal OPEN screen. Clicking it reuses the navbar's shader
  wipe, but expanding outward from the OPEN word, then the existing hero
  animates in. Hover on desktop gives a light magnetic pull; touch devices get
  an instant press response instead. Reduced-motion / no-WebGL visitors get a
  short cross-fade. A failsafe in `<head>` releases the site after 6s if the
  intro script ever fails to start. To remove the entrance entirely, delete the
  `#intro` block, the small `<head>` script, and the `initIntro(...)` line.

**Note:** the page uses an import map and ES modules, so open it through a
web server (`npx serve .`), not by double-clicking `index.html`.

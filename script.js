// ---------------------------------------------------------------
// Aryan Ahirwar — Portfolio
// Clean vanilla JS, no build step, no framework required.
// ---------------------------------------------------------------

document.getElementById('year').textContent = new Date().getFullYear();

/* ---------- mobile nav toggle ---------- */
const navToggle = document.getElementById('navToggle');
const navLinks = document.querySelector('.nav-links');

navToggle.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('is-open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});

navLinks.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

/* ---------- scroll reveal ---------- */
const revealTargets = document.querySelectorAll('.reveal');

const revealObserver = new IntersectionObserver(
  (entries) => {
    // While the entrance screen is up, hold the reveals so the hero animates in
    // once the visitor actually sees it (re-observed on 'intro:done' below).
    if (document.documentElement.classList.contains('intro-active')) return;
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.05 }
);

revealTargets.forEach((el) => revealObserver.observe(el));

window.addEventListener('intro:done', () => {
  revealTargets.forEach((el) => {
    if (el.classList.contains('is-visible')) return;
    revealObserver.unobserve(el);
    revealObserver.observe(el); // re-observing fires an initial callback
  });
});

/* ---------- hero typed line ---------- */
const typedPhrases = [
  'building clean interfaces',
  'crafting smooth interactions',
  'shipping full-stack projects',
];
const typedEl = document.getElementById('typedText');
let phraseIndex = 0;
let charIndex = 0;
let isDeleting = false;

function typeLoop() {
  const current = typedPhrases[phraseIndex];
  const speed = isDeleting ? 35 : 55;

  if (!isDeleting && charIndex <= current.length) {
    typedEl.textContent = current.slice(0, charIndex);
    charIndex++;
  } else if (isDeleting && charIndex >= 0) {
    typedEl.textContent = current.slice(0, charIndex);
    charIndex--;
  }

  if (!isDeleting && charIndex > current.length) {
    isDeleting = true;
    setTimeout(typeLoop, 1200);
    return;
  }
  if (isDeleting && charIndex < 0) {
    isDeleting = false;
    phraseIndex = (phraseIndex + 1) % typedPhrases.length;
    charIndex = 0;
  }

  setTimeout(typeLoop, speed);
}
typeLoop();

/* ---------- portfolio tabs ---------- */
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;

    tabButtons.forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');

    tabPanels.forEach((panel) => {
      panel.classList.toggle('is-active', panel.dataset.panel === target);
    });
  });
});

/* ---------- contact form (opens the visitor's email client) ---------- */
const CONTACT_EMAIL = 'aryanahirwar015@gmail.com';
const contactForm = document.getElementById('contactForm');
const formNote = document.getElementById('formNote');

contactForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const data = new FormData(contactForm);
  const name = data.get('name').trim();
  const email = data.get('email').trim();
  const message = data.get('message').trim();

  const subject = encodeURIComponent(`Portfolio enquiry from ${name}`);
  const body = encodeURIComponent(`${message}\n\n— ${name} (${email})`);

  window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  formNote.textContent = 'Opening your email app…';
  contactForm.reset();
});

/* ---------- comments (backed by the Express API in /backend) ---------- */
// Where the comments API lives. On your own machine it's the local backend;
// once the backend is deployed, put its HTTPS URL in PROD_API_BASE below, e.g.
// 'https://comments.aryanhere.com'. While PROD_API_BASE is empty, the live site
// shows a friendly "comments are off" message instead of a broken section.
const PROD_API_BASE = '';
const IS_LOCAL = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
const API_BASE = IS_LOCAL ? 'http://localhost:4000' : PROD_API_BASE;

const commentForm = document.getElementById('commentForm');
const commentsList = document.getElementById('commentsList');
const commentNote = document.getElementById('commentNote');

function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  const units = [
    ['year', 31536000], ['month', 2592000], ['day', 86400],
    ['hour', 3600], ['minute', 60],
  ];
  for (const [label, secs] of units) {
    const value = Math.floor(seconds / secs);
    if (value >= 1) return `${value} ${label}${value > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

// Escapes text for use in HTML content AND inside quoted attributes (alt="…", src="…").
// (The old textContent/innerHTML trick doesn't escape quotes, which let a comment
// author break out of an attribute and inject script.)
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;',
  }[ch]));
}

function renderComments(comments) {
  if (!comments.length) {
    commentsList.innerHTML = '<p class="empty-sub">No comments yet — be the first to say hello.</p>';
    return;
  }
  commentsList.innerHTML = comments
    .map(
      (c) => `
      <div class="comment-item">
        <div class="comment-head">
          <span class="comment-name">${escapeHtml(c.name)}</span>
          <span class="comment-time">${timeAgo(c.createdAt)}</span>
        </div>
        <p class="comment-message">${escapeHtml(c.message)}</p>
        ${c.imageUrl ? `<img class="comment-image" src="${escapeHtml(API_BASE + c.imageUrl)}" alt="Attachment from ${escapeHtml(c.name)}" />` : ''}
      </div>`
    )
    .join('');
}

async function loadComments() {
  if (!API_BASE) {
    commentsList.innerHTML = '<p class="empty-sub">Comments are taking a short break — feel free to reach out through the contact form instead.</p>';
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/api/comments`);
    if (!res.ok) throw new Error('Failed to load comments.');
    renderComments(await res.json());
  } catch (err) {
    commentsList.innerHTML = `<p class="empty-sub">Couldn't load comments right now. Please try again in a little while.</p>`;
  }
}

commentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!API_BASE) {
    commentNote.textContent = 'Comments are unavailable right now.';
    setTimeout(() => { commentNote.textContent = ''; }, 4000);
    return;
  }
  commentNote.textContent = 'Posting…';

  const submitBtn = commentForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    const formData = new FormData(commentForm);
    const res = await fetch(`${API_BASE}/api/comments`, { method: 'POST', body: formData });
    const payload = await res.json();

    if (!res.ok) throw new Error(payload.error || 'Something went wrong.');

    commentForm.reset();
    commentNote.textContent = 'Posted!';
    await loadComments();
  } catch (err) {
    commentNote.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
    setTimeout(() => { commentNote.textContent = ''; }, 4000);
  }
});

loadComments();

/* ---------- certificates data (add entries here as you earn them) ---------- */
const certificates = [
  // { title: 'Certificate name', issuer: 'Issuer', year: '2026', url: '#' },
];

if (certificates.length) {
  const panel = document.querySelector('[data-panel="certificates"]');
  panel.innerHTML = `<div class="card-grid">${certificates
    .map(
      (c) => `
      <article class="project-card reveal is-visible">
        <div class="project-tag">${c.year}</div>
        <h3>${c.title}</h3>
        <p>${c.issuer}</p>
        ${c.url ? `<a class="project-link" href="${c.url}" target="_blank" rel="noopener noreferrer">View Certificate <span>↗</span></a>` : ''}
      </article>`
    )
    .join('')}</div>`;
}

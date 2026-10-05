import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { JSONFilePreset } from 'lowdb/node';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;

// Comma-separated list of origins allowed to call this API, e.g.
// ALLOWED_ORIGINS="https://aryanhere.com,http://localhost:5500"
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((s) => s.trim());

// ---------- storage setup ----------
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

const db = await JSONFilePreset(path.join(dataDir, 'db.json'), { comments: [] });

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

// The file extension comes from the (verified) image type, never from the
// client-supplied filename, so a crafted filename can't end up in a URL.
const EXT_FOR_TYPE = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${EXT_FOR_TYPE[file.mimetype]}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      return cb(new Error('Unsupported image type. Use PNG, JPEG, WEBP or GIF.'));
    }
    cb(null, true);
  },
});

// ---------- app ----------
const app = express();

app.use(
  cors({
    origin: (origin, cb) => {
      if (ALLOWED_ORIGINS.includes('*') || !origin || ALLOWED_ORIGINS.includes(origin)) {
        return cb(null, true);
      }
      cb(new Error('Not allowed by CORS'));
    },
  })
);
app.use(express.json());
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); // serve uploads only as the images they claim to be
    next();
  },
  express.static(uploadsDir)
);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/comments', async (req, res) => {
  await db.read();
  const comments = [...db.data.comments].sort((a, b) => b.createdAt - a.createdAt);
  res.json(comments);
});

app.post('/api/comments', upload.single('image'), async (req, res) => {
  const name = (req.body.name || '').trim();
  const message = (req.body.message || '').trim();

  if (!name || !message) {
    return res.status(400).json({ error: 'Name and comment are required.' });
  }
  if (name.length > 60) {
    return res.status(400).json({ error: 'Name must be 60 characters or fewer.' });
  }
  if (message.length > 500) {
    return res.status(400).json({ error: 'Comment must be 500 characters or fewer.' });
  }

  const comment = {
    id: crypto.randomUUID(),
    name,
    message,
    imageUrl: req.file ? `/uploads/${req.file.filename}` : null,
    createdAt: Date.now(),
  };

  await db.update(({ comments }) => comments.push(comment));
  res.status(201).json(comment);
});

// centralized error handler — catches multer errors (bad type, too large) too
app.use((err, req, res, next) => {
  const status = err.message?.startsWith('Unsupported image') ? 400 : err.status || 400;
  res.status(status).json({ error: err.message || 'Something went wrong.' });
});

app.listen(PORT, () => {
  console.log(`Comments API running on http://localhost:${PORT}`);
});

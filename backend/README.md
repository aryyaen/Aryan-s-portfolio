# Portfolio Comments API

A small Express API that stores comments (name, message, optional image) for
the portfolio's Comments section. Data is saved to `data/db.json`; uploaded
images are saved to `uploads/` and served back at `/uploads/<file>`.

## Run locally

```bash
cd backend
npm install
npm start
```

The API starts on `http://localhost:4000` by default.

- `GET /api/comments` — list comments, newest first
- `POST /api/comments` — create a comment. `multipart/form-data` with fields
  `name`, `message`, and an optional `image` file (PNG/JPEG/WEBP/GIF, 4MB max)

## Connect the frontend

In `script.js`, set `API_BASE` to wherever this server is running, e.g.
`http://localhost:4000` while developing, or your deployed URL in production.

## Environment variables

- `PORT` — port to listen on (default `4000`)
- `ALLOWED_ORIGINS` — comma-separated list of origins allowed to call the API,
  e.g. `https://aryanhere.com,http://localhost:5500`. Defaults to `*` (any
  origin) — tighten this once you deploy.

## Deploying

This server writes to the local disk (`data/db.json` and `uploads/`), so it
needs a host with a **persistent filesystem** — a small VPS, or a platform
like Render/Railway/Fly.io on a plan that keeps disk between deploys.
Serverless platforms (e.g. Vercel/Netlify functions) wipe the filesystem on
every cold start, so comments and images would disappear — avoid those unless
you swap the storage layer for a real database and object storage (e.g.
Postgres + S3/R2).

Whichever host you pick:
1. Set `ALLOWED_ORIGINS` to your real domain.
2. Put this behind HTTPS (most hosts do this for you).
3. Point `API_BASE` in the frontend's `script.js` at the deployed URL.

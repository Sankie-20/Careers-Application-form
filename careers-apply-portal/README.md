# Zig Careers Apply Portal

Standalone job application UI for **Azure App Service** (or any Node host). It matches the immersive apply experience on the main Astro site and loads **role + copy metadata** from the main site’s API.

## Architecture

| Component | URL | Purpose |
|-----------|-----|---------|
| Main Astro site | `https://zigos.ai` (or preview) | `GET /api/careers/apply-context?role=…` — Sanity + recruit role data |
| This portal | e.g. `https://your-app.azurewebsites.net` | UI + `POST /api/submit` → n8n webhooks |

Submissions **do not** call `/api/careers/apply` on the Astro site, avoiding Vercel preview protection / WAF blocks on multipart uploads.

## Setup

```bash
cd careers-apply-portal
cp .env.example .env
npm install
npm run dev
```

Set **`PUBLIC_CAREERS_APPLY_PORTAL_URL`** and **`PORT`** in `.env` (see `.env.example`). The server reads both — no hardcoded port in code.

Open: `{PUBLIC_CAREERS_APPLY_PORTAL_URL}/?role=general-application` (e.g. `http://localhost:8081/?role=general-application`).

On the **main site** `.env`, set the **same** `PUBLIC_CAREERS_APPLY_PORTAL_URL` so Apply buttons route to the portal. CORS for that origin is added automatically from that variable.

## Environment variables

| Variable | Description |
|----------|-------------|
| `PUBLIC_CAREERS_APPLY_PORTAL_URL` | Public portal URL (must match main site; port used if `PORT` unset) |
| `PORT` | HTTP listen port (set in `.env`; Azure may override) |
| `CONTEXT_API_BASE_URL` | Main site origin, e.g. `https://preview.zigos.ai` |
| `CAREERS_BASE_PATH` | Careers path on main site (default `/careers`) |
| `CAREERS_JOB_APPLICATION_WEBHOOK_URL` | n8n webhook for role applications |
| `CAREERS_GENERAL_APPLICATION_WEBHOOK_URL` | n8n webhook for general applications |

## Main site configuration

On the **Astro / Vercel** project:

1. Point Apply links to the portal (CORS for this origin is added automatically):
   ```bash
   PUBLIC_CAREERS_APPLY_PORTAL_URL=https://your-app.azurewebsites.net
   ```
3. Redeploy the main site so `buildCareerApplicationHref()` uses the portal URL.

## Deploy to Azure

See **[AZURE.md](./AZURE.md)** for full steps (CLI, env vars, custom domain, GitHub Actions, and verification).

Quick checklist: Node **22 LTS** Linux Web App → set Application settings from `.env.example` → startup `node server.js` → health check `/health` → set `PUBLIC_CAREERS_APPLY_PORTAL_URL` on the main site.

## Local development with main site

1. Terminal A: `npm run dev` in repo root (Astro on `http://localhost:4321`)
2. Terminal B: `CONTEXT_API_BASE_URL=http://localhost:4321 npm run dev` in `careers-apply-portal/`

## Files

- `server.js` — Express static server + submit API
- `lib/submit.js` — Validation + n8n forward (same rules as Astro `apply.ts`)
- `lib/config.js` — Env loading
- `public/` — HTML, CSS, client JS (immersive apply layout)

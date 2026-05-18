# Deploy Careers Apply Portal to Azure

This guide deploys the **`careers-apply-portal`** app to **Azure App Service** (Linux, **Node 22 LTS**). The portal serves the apply UI and accepts file uploads; it loads role metadata from the main Zig website and forwards submissions to n8n.

## What you are deploying

| Piece | Location |
|-------|----------|
| App folder | `careers-apply-portal/` in the ZigWebsite repo |
| Runtime | Node 22 LTS (or 24 LTS; app requires Node 20+) |
| Entry command | `npm start` → `node server.js` |
| Health probe | `GET /health` |
| Public API | `POST /api/submit` (multipart resume upload) |

**Not deployed with this app:** the Astro site, Sanity, or Vercel. Those stay on your existing main-site host.

## Architecture after deploy

```
User → https://apply.yourdomain.com/?role=…
         ├─ GET  /api/config              (portal)
         ├─ GET  {main-site}/api/careers/apply-context?role=…  (metadata)
         └─ POST /api/submit              (portal → n8n webhooks)

Main site (Vercel) → Apply buttons use PUBLIC_CAREERS_APPLY_PORTAL_URL
```

## Prerequisites

- Azure subscription and permission to create a Resource Group + App Service
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) (`az`) logged in, or access to Azure Portal
- Main site live with `GET /api/careers/apply-context` deployed
- n8n webhook URLs for job and general applications
- (Recommended) Custom domain + TLS for production (e.g. `apply.zigos.ai`)

## 1. Create the Web App

**Azure Portal:** On **Create Web App**, choose **Publish: Code**, **Runtime stack: Node 22 LTS**, Linux. (Node 24 LTS also works; Node 20 is no longer listed in the portal.)

**Azure CLI** — replace names with your own:

```bash
az login

RESOURCE_GROUP=zig-careers-rg
APP_NAME=zig-careers-apply-portal
LOCATION=westeurope

az group create --name $RESOURCE_GROUP --location $LOCATION

az appservice plan create \
  --name "${APP_NAME}-plan" \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku B1 \
  --is-linux

az webapp create \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --plan "${APP_NAME}-plan" \
  --runtime "NODE:22-lts"
```

Notes:

- **SKU:** `B1` is fine for low traffic; use `P1v3`+ for production SLAs.
- App Service sets **`PORT`** automatically (usually `8080`). Your code reads `process.env.PORT` — do not hardcode a port in Azure.

## 2. Configure application settings

Set these in **Azure Portal → App Service → Settings → Environment variables** (or CLI below).

| Setting | Example (production) | Required |
|---------|----------------------|----------|
| `PUBLIC_CAREERS_APPLY_PORTAL_URL` | `https://zig-careers-apply-portal.azurewebsites.net` or `https://apply.zigos.ai` | Yes |
| `CONTEXT_API_BASE_URL` | `https://zigos.ai` or `https://preview.zigos.ai` | Yes |
| `CAREERS_BASE_PATH` | `/careers` | Yes |
| `CAREERS_JOB_APPLICATION_WEBHOOK_URL` | `https://thezig.app.n8n.cloud/webhook/...` | Yes |
| `CAREERS_GENERAL_APPLICATION_WEBHOOK_URL` | `https://thezig.app.n8n.cloud/webhook/...` | Yes |
| `SITE_BRAND` | `The Zig Group` | Optional |

**Important:** `PUBLIC_CAREERS_APPLY_PORTAL_URL` must be the **final public HTTPS URL** users open (custom domain or `*.azurewebsites.net`). Azure injects `PORT` for listening; you do not need to set `PORT` in App Service settings unless you have a specific reason.

CLI example:

```bash
az webapp config appsettings set \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --settings \
    PUBLIC_CAREERS_APPLY_PORTAL_URL="https://${APP_NAME}.azurewebsites.net" \
    CONTEXT_API_BASE_URL="https://preview.zigos.ai" \
    CAREERS_BASE_PATH="/careers" \
    CAREERS_JOB_APPLICATION_WEBHOOK_URL="https://thezig.app.n8n.cloud/webhook-test/application-form" \
    CAREERS_GENERAL_APPLICATION_WEBHOOK_URL="https://thezig.app.n8n.cloud/webhook-test/general-application" \
    SITE_BRAND="The Zig Group"
```

## 3. Startup command

**Configuration → General settings → Startup Command:**

```bash
node server.js
```

Or leave blank if **Configuration → Stack settings** uses:

- **Startup command:** `npm start`

Both run `node server.js` per `package.json`.

## 4. Deploy the code

Deploy **only** the contents of `careers-apply-portal/` (not the whole monorepo unless your pipeline builds from a subfolder).

### Option A — ZIP deploy (quick)

From the repo root:

```bash
cd careers-apply-portal
npm ci --omit=dev
zip -r ../careers-apply-portal.zip . \
  -x "*.git*" -x ".env" -x "node_modules/.cache/*"

az webapp deploy \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --src-path ../careers-apply-portal.zip \
  --type zip
```

On Windows (PowerShell), create the zip with your tool of choice, then use the same `az webapp deploy` command.

### Option B — GitHub Actions

Create `.github/workflows/deploy-careers-apply-portal.yml` in the repo (example):

```yaml
name: Deploy Careers Apply Portal

on:
  push:
    branches: [main]
    paths:
      - 'careers-apply-portal/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: careers-apply-portal/package-lock.json

      - name: Install and package
        working-directory: careers-apply-portal
        run: |
          npm ci --omit=dev
          zip -r ../package.zip . -x ".env"

      - name: Deploy to Azure Web App
        uses: azure/webapps-deploy@v3
        with:
          app-name: ${{ secrets.AZURE_APPLY_APP_NAME }}
          publish-profile: ${{ secrets.AZURE_APPLY_PUBLISH_PROFILE }}
          package: package.zip
```

Add **Publish profile** from Azure Portal → App Service → Deployment Center → Download publish profile → GitHub secret `AZURE_APPLY_PUBLISH_PROFILE`.

### Option C — Azure Portal Deployment Center

Connect GitHub to the App Service and set **Path** / build output to `careers-apply-portal` if your repo layout requires it.

## 5. Custom domain (optional)

```bash
az webapp config hostname add \
  --webapp-name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --hostname apply.zigos.ai
```

1. Add DNS **CNAME** `apply` → `<app-name>.azurewebsites.net`
2. Enable **HTTPS** (App Service managed certificate or your cert)
3. Update **`PUBLIC_CAREERS_APPLY_PORTAL_URL`** to `https://apply.zigos.ai`
4. Redeploy or restart the app so config reloads

## 6. Configure the main Astro / Vercel site

On the **main website** project (same values in Vercel Environment Variables for Production / Preview):

```bash
PUBLIC_CAREERS_APPLY_PORTAL_URL=https://apply.zigos.ai
CONTEXT_API_BASE_URL=https://zigos.ai
```

(Preview can use `https://preview.zigos.ai` for `CONTEXT_API_BASE_URL` on a preview portal instance.)

CORS: the main site **automatically allows** the origin of `PUBLIC_CAREERS_APPLY_PORTAL_URL` for `/api/careers/apply-context`. You only need extra entries in `PUBLIC_CAREERS_APPLY_ALLOWED_ORIGINS` for other origins (e.g. local dev).

Redeploy the main site after changing env vars so Apply links use `buildCareerApplicationHref()` → portal URL.

## 7. Verify deployment

1. **Health**
   ```bash
   curl https://<your-app>.azurewebsites.net/health
   ```
   Expected: `{"ok":true}`

2. **Config**
   ```bash
   curl https://<your-app>.azurewebsites.net/api/config
   ```
   Check `contextApiBase`, `publicOrigin`, `portalPublicUrl`.

3. **Context from main site** (browser or curl)
   ```bash
   curl "https://zigos.ai/api/careers/apply-context?role=general-application"
   ```

4. **UI** — open  
   `https://<your-app>.azurewebsites.net/?role=general-application`  
   Submit a test PDF (≤ 5 MB).

5. **Main site** — open careers, click Apply; URL should be the portal with `?role=…`.

## 8. App Service recommendations

| Setting | Recommendation |
|---------|----------------|
| **Health check** | Path: `/health` |
| **Always On** | Enabled (avoid cold start on B1+) |
| **HTTP version** | 2.0 |
| **Minimum TLS** | 1.2 |
| **Request size** | Default is enough for 5 MB uploads; increase if you raise limits in code |

For large traffic or bigger files, review [App Service limits](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits#app-service-limits) and consider **Premium** tier.

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| “Unable to load application” / context error | Wrong `CONTEXT_API_BASE_URL` or main site not deployed | Set URL to live Astro origin; confirm `/api/careers/apply-context` works |
| CORS error in browser | Portal origin not allowed on main site | Set `PUBLIC_CAREERS_APPLY_PORTAL_URL` on **both** apps to the same public URL; redeploy main site |
| 502 on submit | n8n webhook down or wrong URL | Check `CAREERS_*_WEBHOOK_URL` in App Service settings and n8n logs |
| 413 / upload failed | File > 5 MB | Use smaller file or adjust limit in `lib/config.js` + App Service |
| App won’t start | Missing env or wrong Node version | Log stream in Portal; use **Node 22 LTS** (or 24 LTS); set startup `node server.js` |
| Apply still goes to `/careers/apply` | Main site missing portal URL | Set `PUBLIC_CAREERS_APPLY_PORTAL_URL` on Vercel and redeploy |

**Logs:** Azure Portal → App Service → **Log stream** or **Monitoring → Logs**.

## 10. Files included in deployment

```
careers-apply-portal/
├── server.js
├── package.json
├── package-lock.json
├── lib/
│   ├── config.js
│   └── submit.js
└── public/
    ├── index.html
    ├── app.js
    └── styles.css
```

Do **not** deploy `.env` (secrets). Use Application settings only.

---

**Related:** [README.md](./README.md) for local development. Main site env reference: `../env.example`.

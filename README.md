# CookTwo — Website & App Monorepo

Single repository for everything CookTwo: the **marketing site** (cooktwo.com), the **PWA app** (cooktwo.app), the **API worker**, and the **domain router** that fronts both. Pushes to `main` deploy automatically to Cloudflare via GitHub Actions.

---

## Live endpoints

| What | URL | Cloudflare target | Source folder |
|---|---|---|---|
| Marketing site | https://cooktwo.com | Pages · `couples-food-system-v3` | `website/` |
| App (PWA) | https://cooktwo.app | Pages · `cfs-app` | `app/frontend/` |
| API | https://couples-food-system-api.byte-digital.workers.dev | Worker · `couples-food-system-api` | `app/worker/` |
| Domain router | (routes both domains) | Worker · `cooktwo-domain-router` | `infrastructure/router/` |

Traffic flow: the **router** receives all `cooktwo.com` / `cooktwo.app` requests and reverse-proxies them to the right Pages project. The PWA talks to the API worker directly.

---

## Repository layout

```
website/              Astro marketing site (cooktwo.com)
app/frontend/         React 19 + Vite PWA (cooktwo.app)
app/worker/           Cloudflare Worker — Hono API + Durable Objects + D1
app/seeds/            DB seed data
app/docs/             App-specific docs
infrastructure/router/  cooktwo-domain-router (cooktwo.com + cooktwo.app front door)
research/             Market research, diet research, brand docs (non-deployed)
archive/              Legacy / superseded code (kept for reference, not deployed)
.github/workflows/    CI: auto-deploys on push to main
```

---

## Local development

Each piece is independent. Node.js 22+ required.

```bash
# Website (cooktwo.com) — http://localhost:4321
cd website && npm install && npm run dev

# App frontend (cooktwo.app) — http://localhost:5173
cd app/frontend && npm install && npm run dev

# App API worker — http://localhost:8787
cd app/worker && npm install && npm run dev
```

### Frontend env
The app frontend reads `VITE_API_URL`, `VITE_WS_URL`, `VITE_VAPID_PUBLIC_KEY` at build time. Locally, create `app/frontend/.env.production` (gitignored) — see `app/frontend/.env.example` for the template. In CI these are provided by the workflow (public values).

---

## Deployment

**Automatic** — every push to `main` triggers the workflow(s) for the path(s) that changed:

| Change under | Deploys |
|---|---|
| `website/**` | Website → cooktwo.com |
| `app/frontend/**` | PWA → cooktwo.app |
| `app/worker/**` | API worker |
| `infrastructure/router/**` | Domain router |

Workflows also expose a `Run workflow` button (Actions tab) for manual deploys.

### Required GitHub secrets
Set in **Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_API_TOKEN` — token with scopes: Account · Cloudflare Pages · Edit, Workers Scripts · Edit, D1 · Edit, Workers Routes · Edit, Account · Read.
- `CLOUDFLARE_ACCOUNT_ID` — `4e8ffd7b6c48adfd409acaf77cf28b89`

### D1 migrations (manual)
Worker deploys do **not** apply D1 migrations. After adding/Changing `app/worker/migrations/*.sql`, apply them once:
```bash
cd app/worker
npx wrangler d1 migrations apply couples-food-system --remote
```

### Worker runtime secrets
`DEEPSEEK_KEY`, `ALIBABA_KEY`, `ZAI_KEY`, `JWT_SECRET`, VAPID private key, Resend, Stripe, etc. are set directly on the deployed worker via `npx wrangler secret put <NAME>` and persist across CI deploys — they are never stored in this repo.

---

## How the pieces connect

```
                ┌──────────────────────────┐
   cooktwo.com  │  cooktwo-domain-router   │  cooktwo.app
   cooktwo.app ─▶  (Cloudflare Worker)     ◀──
                └────────────┬─────────────┘
                    ┌────────┴─────────┐
                    ▼                  ▼
        couples-food-system-v3     cfs-app
            (Pages: website)      (Pages: PWA)
                                          │
                        direct API calls  │  (VITE_API_URL)
                                          ▼
                             couples-food-system-api
                               (Worker + D1 + DO)
```

---

## Notes

- **Legacy code** lives under `archive/` (the un-deployed Astro+Supabase `cupla-web`, and the older `cfs-routing-worker`). Not wired to any workflow.
- **History**: this monorepo preserves full git history from both the marketing site and `CFS_App` (merged via `git subtree`).

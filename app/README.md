# Couples Food System

> A progressive web app for couples to share a kitchen, a grocery list, and a meal plan — in real time.

**Status:** Full MVP complete. Guided first-run experience (6-step wizard for Partner 1, code-join for Partner 2). Three pillars: Shopping List (real-time sync, offline queue, "Your regulars"), Pantry (natural language input, "Move to Pantry"), Meals (AI chat-based generation with session memory, weekly planning, saved recipe library with expandable cards). Adaptive cooking ("one prep, two plates") with body profiles and TDEE. PWA installable. See [Roadmap](#roadmap) for what's parked.

---

## What this is

A two-package monorepo:

- **`worker/`** — Cloudflare Worker (Hono) with two Durable Objects (`HouseholdSync` for real-time grocery data, `InviteStore` for invite codes). Each couple gets their own DO instance — one source of truth, sub-100ms sync between partners.
- **`frontend/`** — React 19 + Vite + TypeScript + Tailwind. Installable PWA. Two onboarding flows (create a kitchen / join with a code). The "we" language of the brand runs through the copy.

The brand follows the [source-of-truth spec](https://couples-food-system.com/source-of-truth): cream / sage / terracotta palette, Inter typeface, partner color coding (sage for slot 1, terracotta for slot 2).

---

## Quick start

You need **Node.js 22+** and a terminal. No Cloudflare account required for local dev.

```bash
# 1. Install the worker
cd worker
npm install

# 2. Install the frontend (in a second terminal)
cd ../frontend
npm install
```

Then start both, each in its own terminal:

```bash
# Terminal 1 — backend on http://localhost:8787
cd worker
npm run dev

# Terminal 2 — frontend on http://localhost:5173
cd frontend
npm run dev
```

Open `http://localhost:5173`. You'll see the onboarding flow:

1. **"Start our kitchen"** — give yourself a name, get a 6-digit invite code.
2. Copy that code. Open a second browser window (or an incognito window, or your phone on the same Wi-Fi).
3. **"Join my partner"** in the second window — paste the code, give yourself a name.
4. Both windows now share the same kitchen. Add an item in one. It appears in the other in under 100ms.

The header dot turns **green** when the WebSocket is live, **terracotta** when reconnecting, **red** when offline.

---

## Project structure

```
couples-food-system/
├── worker/                         # Cloudflare Worker (Hono)
│   ├── src/
│   │   ├── index.ts                # Hono routes, /api/household/*
│   │   ├── env.d.ts                # Cloudflare binding types (DEEPSEEK_KEY, AI_PROVIDER, etc.)
│   │   ├── durable-objects/
│   │   │   ├── HouseholdSync.ts    # Per-couple DO: SQLite + WebSocket for grocery/pantry sync
│   │   │   └── InviteStore.ts      # Singleton DO for 6-digit invite codes
│   │   ├── lib/
│   │   │   ├── ai.ts               # AI meal generation: chatWithAI(), callDeepSeekChat(), system prompts
│   │   │   ├── ai-pantry-parser.ts # AI-powered pantry item parsing
│   │   │   ├── jwt.ts              # JWT sign/verify with jose
│   │   │   ├── pantry.ts           # Regex-based pantry input parser
│   │   │   ├── pantry-parser.ts    # Sync pantry item parsing
│   │   │   ├── parse-cache.ts      # Parse result cache for pantry
│   │   │   └── tdee.ts            # TDEE calculator (body profiles → calorie targets)
│   │   └── routes/
│   │       ├── mealChat.ts         # POST /api/household/:id/meal-chat (AI chat endpoint)
│   │       ├── mealplan.ts         # Week plan generation + confirm meal
│   │       ├── profiles.ts         # Partner profiles CRUD + TDEE
│   │       └── recipes.ts          # Saved recipes CRUD
│   ├── migrations/
│   │   ├── 0001_profiles.sql       # Partners table
│   │   ├── 0002_meal_plans.sql     # Weekly meal plans table
│   │   ├── 0003_body_profiles.sql  # Body profile columns
│   │   └── 0004_recipes.sql        # Saved recipes table
│   ├── wrangler.toml               # DO + D1 + AI_PROVIDER config
│   ├── tsconfig.json
│   └── package.json
│
├── frontend/                       # React 19 + Vite + Tailwind PWA
│   ├── src/
│   │   ├── main.tsx                # React + Query + Router entry
│   │   ├── App.tsx                 # Routes, auth gate
│   │   ├── index.css               # Tailwind + brand base styles
│   │   ├── env.d.ts                # Vite env types
│   │   ├── types/
│   │   │   ├── grocery.ts          # GroceryItem, PantryItem, SyncEvent, Category
│   │   │   └── meal.ts             # GeneratedMeal, MealIngredient, PlatingInstruction
│   │   ├── lib/
│   │   │   ├── api.ts              # apiFetch() with auth header
│   │   │   ├── categories.ts       # classify() + QUICK_ADD presets
│   │   │   └── offlineQueue.ts     # Offline queue for grocery items
│   │   ├── stores/
│   │   │   └── authStore.ts        # Zustand + localStorage persist
│   │   ├── hooks/
│   │   │   ├── useAuth.ts          # Create/join household helpers
│   │   │   ├── useGroceryList.ts   # TanStack Query + WS subscription
│   │   │   ├── useMealChat.ts      # AI chat state (localStorage persistence)
│   │   │   ├── useMealPlan.ts      # Single meal generator (deprecated)
│   │   │   ├── useWeekPlan.ts      # Week plan generation
│   │   │   ├── useRecipes.ts       # Saved recipes (list, save, delete)
│   │   │   ├── usePantry.ts        # Pantry items with WS sync
│   │   │   ├── useProfiles.ts      # Partner profiles
│   │   │   ├── useRegulars.ts      # Frequent grocery items
│   │   │   ├── useInstallPrompt.ts # PWA install prompt
│   │   │   └── useOfflineQueue.ts  # Offline sync state
│   │   ├── pages/
│   │   │   ├── Onboarding.tsx      # Welcome / Create / Join / Created wizard
│   │   │   ├── MainApp.tsx         # Header + bottom nav shell
│   │   │   ├── ShoppingTab.tsx     # Grocery list UI
│   │   │   ├── PantryTab.tsx       # Pantry management UI
│   │   │   ├── MealPlanTab.tsx     # AI chat, saved recipes (expandable), week plan
│   │   │   └── ProfilesTab.tsx     # Dietary preferences, body goals
│   │   └── components/
│   │       ├── ShoppingList.tsx     # Main list with categories
│   │       ├── CategorySection.tsx  # Collapsible category groups
│   │       ├── ItemRow.tsx          # Individual item row
│   │       ├── PartnerDot.tsx       # Colored dot per partner
│   │       ├── AddItemForm.tsx      # Input + submit
│   │       ├── QuickAddChips.tsx    # One-tap quick-add buttons
│   │       ├── RegularsChips.tsx    # Frequently bought items
│   │       ├── ShareCodeButton.tsx  # Invite code display/copy
│   │       ├── SyncIndicator.tsx    # WS connection dot
│   │       └── InstallBanner.tsx    # PWA install prompt banner
│   ├── public/                      # favicon, icons, manifest
│   ├── scripts/
│   │   └── generate-icons.mjs      # npm run icons
│   ├── .env.development            # VITE_API_URL=http://localhost:8787
│   ├── .env.production             # VITE_API_URL=production worker URL
│   ├── vite.config.ts              # Vite + PWA plugin
│   ├── tailwind.config.js          # Brand palette
│   ├── tsconfig.json
│   └── package.json
│
├── docs/                           # Documentation
│   └── AI_MEAL_GENERATION.md       # AI architecture & troubleshooting guide
│
└── README.md                       # You are here
```

---

## API reference

All endpoints are under `/api/`. Auth is `Authorization: Bearer <jwt>`.

### Household

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/household/create` | Create household. Body: `{ displayName }`. Returns `{ householdId, inviteCode, token }`. |
| `POST` | `/api/household/join` | Join with code. Body: `{ inviteCode, displayName }`. Returns `{ householdId, token }`. |
| `POST` | `/api/household/link` | Link existing account to another household. Body: `{ inviteCode }`. |

### Profiles

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/household/:id/profiles` | List partners (name, diet, allergies, TDEE). |
| `PUT` | `/api/household/:id/profiles/:partnerId` | Update partner profile (diet, goal, body stats). |

### Grocery list

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/household/:id/items` | List grocery items. |
| `POST` | `/api/household/:id/items` | Add item. Body: `{ name, category, addedByPartnerId, addedByPartnerSlot }`. |
| `PATCH` | `/api/household/:id/items/:itemId/toggle` | Toggle checked state. |
| `DELETE` | `/api/household/:id/items/:itemId` | Delete item. |
| `GET` | `/api/household/:id/regulars` | Most-frequently bought items. |

### Pantry

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/household/:id/pantry` | List pantry items (name, quantity, category, brand). |
| `POST` | `/api/household/:id/pantry` | Add item. Body: `{ name, quantity, addedByPartnerId, addedByPartnerSlot }`. |
| `POST` | `/api/household/:id/pantry/bulk` | Bulk add items. Body: `{ items: [{ name, quantity }], addedByPartnerId, addedByPartnerSlot }`. |
| `DELETE` | `/api/household/:id/pantry/:itemId` | Delete item. |
| `POST` | `/api/household/:id/pantry/subtract` | Subtract used ingredients after cooking. |

### Meals — AI chat

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/household/:id/meal-chat` | **Main AI endpoint.** Body: `{ message, history }`. Returns `{ message, meal?, actions? }`. Conversations span multiple messages. |
| `POST` | `/api/household/:id/meal-plan/generate` | Single-shot meal generation (deprecated, kept for week plan compat). |
| `GET` | `/api/household/:id/meal-plan/week` | Get weekly plan. |
| `POST` | `/api/household/:id/meal-plan/week/generate` | Generate full week (7 days). |
| `POST` | `/api/household/:id/meal-plan/confirm` | Subtract used pantry ingredients after cooking. |

### Saved recipes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/household/:id/recipes` | List saved recipes. |
| `POST` | `/api/household/:id/recipes` | Save a recipe. Body: `{ name, mealData }` (mealData is JSON-stringified `GeneratedMeal`). |
| `DELETE` | `/api/household/:id/recipes/:recipeId` | Delete a saved recipe. |

### Real-time

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/household/:id/ws` | WebSocket upgrade. Query: `?token=…&partnerId=…&slot=1|2`. Server pushes `item_added/toggled/deleted` and `pantry_added/deleted` events. |

### Sync event format

```ts
type SyncEvent =
  | { type: 'hello'; partnerId: string; slot: 1 | 2; at: number }
  | { type: 'item_added'; item: GroceryItem }
  | { type: 'item_toggled'; item: GroceryItem }
  | { type: 'item_deleted'; id: string }
  | { type: 'pantry_added'; item: PantryItem }
  | { type: 'pantry_deleted'; id: string };
```

### Quick curl example

```bash
# Create a household
curl -X POST http://localhost:8787/api/household/create \
  -H 'content-type: application/json' \
  -d '{"displayName":"Alex"}'

# Add an item (replace TOKEN with the value from above)
curl -X POST http://localhost:8787/api/household/<householdId>/items \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"name":"milk","category":"Dairy","addedByPartnerId":"<partnerId>","addedByPartnerSlot":1}'
```

---

## Available scripts

### Worker (`worker/`)

| Command | What it does |
|---|---|
| `npm run dev` | Run the worker locally on `http://localhost:8787`. |
| `npm run deploy` | Deploy to Cloudflare. Requires `wrangler login` first. |
| `npm run typecheck` | TypeScript check, no emit. |
| `npm run tail` | Tail the deployed worker's logs. |

### Frontend (`frontend/`)

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on `http://localhost:5173` with hot reload. |
| `npm run build` | TypeScript check + production build to `dist/`. |
| `npm run preview` | Serve `dist/` locally (smoke test the production bundle). |
| `npm run typecheck` | TypeScript check, no emit. |
| `npm run icons` | Regenerate PWA icons from `public/icon-source.svg`. |

---

## Deployment

### Worker

```bash
cd worker
npx wrangler deploy
```

Before first deploy, set secrets:
```bash
npx wrangler secret put DEEPSEEK_KEY
npx wrangler secret put ALIBABA_KEY
npx wrangler secret put ZAI_KEY
```

### Frontend (Cloudflare Pages)

```bash
cd frontend
npm run build
npx wrangler pages deploy dist --project-name=cfs-app
```

**Important:** The frontend needs `.env.production` with the worker URL:

```
VITE_API_URL=https://couples-food-system-api.byte-digital.workers.dev
VITE_WS_URL=wss://couples-food-system-api.byte-digital.workers.dev
```

### Production URLs

- **Frontend:** https://cfs-app.pages.dev
- **Worker:** https://couples-food-system-api.byte-digital.workers.dev

### Troubleshooting AI issues

See [`docs/AI_MEAL_GENERATION.md`](docs/AI_MEAL_GENERATION.md) for complete architecture, common issues, and deployment checklist for the AI meal generation system.

---

## Step 1 acceptance test

Run this before moving to Step 2. If any item fails, fix it before continuing.

- [ ] `cd worker && npm run dev` — Wrangler starts on `http://127.0.0.1:8787`. No errors in the console.
- [ ] `cd frontend && npm run dev` — Vite starts on `http://localhost:5173`. The cream-colored onboarding screen loads.
- [ ] **Create a household** in tab A: enter a name, see a 6-digit invite code, continue to the shopping list.
- [ ] **Join the household** in tab B (incognito window or different device on same Wi-Fi): enter the code, enter a name, land on an empty shopping list.
- [ ] **Add an item** in tab A (e.g., "Milk"). Watch it appear in tab B in **under 1 second** (target: <100ms).
- [ ] **Check off** the item in tab B. Watch tab A update instantly.
- [ ] **Delete** the item in either tab. It disappears in the other.
- [ ] **Refresh** tab A. The list is still there (persisted in DO SQLite).
- [ ] **Close and reopen** the browser entirely. You're still signed in (token persisted in `localStorage` under `cfs.auth`).
- [ ] **The header dot is green** when both windows are focused; it briefly turns terracotta when the WS is reconnecting; red when the network is killed.
- [ ] **Brand colors render**: cream background, sage primary buttons and tab indicator, terracotta for partner 2's dot, Inter font.
- [ ] `cd frontend && npm run build` — production build completes. `dist/manifest.webmanifest` exists. `dist/sw.js` exists.
- [ ] `cd worker && npx wrangler deploy --dry-run` — compiles cleanly. Both Durable Objects (`HOUSEHOLD_SYNC`, `INVITE_STORE`) are listed in the bindings.

When all 12 pass, **Step 1 is done. Tell the assistant you're ready for Step 2.**

---

## Pre-release checklist

Run this before every production deploy:

- [ ] `cd worker && npm test` — 64+ tests pass
- [ ] `cd frontend && npm test` — 5+ tests pass
- [ ] `cd worker && npm run typecheck` — no errors
- [ ] `cd frontend && npm run typecheck` — no errors
- [ ] `npx wrangler d1 migrations apply couples-food-system` — no pending migrations
- [ ] All 3 AI provider secrets (`DEEPSEEK_KEY`, `ALIBABA_KEY`, `ZAI_KEY`) set in prod
- [ ] `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` set in prod
- [ ] `SITE_URL`, `PWA_URL`, `RESEND_FROM` are production values
- [ ] `JWT_SECRET` differs from dev default — verify by decoding a prod token
- [ ] `frontend/.env.production` `VITE_API_URL` / `VITE_WS_URL` point at prod worker
- [ ] Run a 2-partner canary against prod: create couple, set vegan + shellfish allergies, request dinner, visually confirm no shellfish in the meal
- [ ] `wrangler tail` during a 5-minute soak: no 500s on `meal-chat`, no DO eviction logs, no D1 `SQLITE_BUSY`

## Roadmap

- [x] **Step 1** — Shared grocery list with real-time sync
- [x] **Step 2** — PWA install + mobile polish + offline support
- [x] **Step 3** — Partner profiles + D1 database
- [x] **Step 4** — Pantry tracking
- [x] **Step 5** — AI meal generation (chat-based with session memory)
- [x] **Step 6** — Meal calendar + smart grocery
- [x] **Step 7** — Adaptive shared cooking (the moat)

Each step is independently shippable.

---

## Troubleshooting

**"Port 8787 already in use"** — another `wrangler dev` is running, or another app. Find and kill it, or run `wrangler dev --port 9000` and update the frontend's `VITE_API_URL` to match.

**"Port 5173 already in use"** — same idea. Run `npm run dev -- --port 5174`.

**The header dot stays terracotta or red** — the WebSocket can't connect. Check:
- Is the worker still running in its terminal? (Look for any errors.)
- Did you change `VITE_API_URL` or `VITE_WS_URL`? They must point at the same place the worker is running.
- Open DevTools → Network → WS. Click on the connection. If the status is "failed," the URL is wrong. If it connects, the issue is elsewhere.

**"401 Unauthorized" on every request** — your JWT expired (30 days) or the worker was restarted with a different `JWT_SECRET`. Sign out and back in.

**Two tabs don't sync** — they need to be in the same household. The code on the join screen must match an existing household. Open the create-household screen in tab A to see the code, then enter that exact code in tab B.

**Icons missing in `dist/` after build** — run `npm run icons` in `frontend/` to regenerate them from the SVG.

**"Cannot find module '../stores/authStore'"** — you moved a file without updating the import. Check the import path: from `src/`, stores are at `./stores/authStore`.

---

## License

MIT.

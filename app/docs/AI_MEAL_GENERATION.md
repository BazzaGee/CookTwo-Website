# AI Meal Generation — Architecture & Troubleshooting

## Architecture overview

```
User types message
       │
       ▼
useMealChat (frontend/src/hooks/useMealChat.ts)
  • Stores conversation in localStorage (survives tab switches)
  • Sends POST /api/household/:id/meal-chat
  • Renders response (text + optional meal card)
       │
       ▼
mealChat.ts (worker/src/routes/mealChat.ts)
  • Auth check (JWT)
  • Loads pantry from HouseholdSync DO
  • Loads partner profiles (diets, allergies, TDEE) from D1
  • Calls chatWithAI()
  • Auto-executes addToPantry / addToList actions
       │
       ▼
chatWithAI() (worker/src/lib/ai.ts)
  • Builds system prompt with pantry, profiles, context
  • Calls callDeepSeekChat()
  • Three-step JSON parsing (raw → markdown cleanup → text fallback)
  • Returns { message, meal?, actions? }
       │
       ▼
callDeepSeekChat() (worker/src/lib/ai.ts)
  • Uses deepseek-v4-flash only (no fallback to Pro)
  • POST to api.deepseek.com/chat/completions
  • Returns raw response text or null
       │
        ▼
DeepSeek API
   • Model: deepseek-v4-flash
   • Thinking mode disabled (saves reasoning tokens)
   • Receives: system prompt + conversation history
   • Returns: JSON with meal, ingredients, steps, macros
```

## File map

### Worker (backend)

| File | Purpose |
|------|---------|
| `worker/src/lib/ai.ts` | Core AI logic: `generateMeal()`, `chatWithAI()`, `callDeepSeekChat()`, `callProvider()`, system prompt builders |
| `worker/src/routes/mealChat.ts` | `POST /api/household/:id/meal-chat` — chat endpoint handler |
| `worker/src/routes/mealplan.ts` | Week plan generation (calls `generateMeal()` per day) |
| `worker/src/index.ts` | Route wiring: `/meal-plan/generate`, `/meal-plan/week/generate`, `/meal-chat` |
| `worker/src/env.d.ts` | Type definitions for `Env` bindings (`AI_PROVIDER`, `DEEPSEEK_KEY`, etc.) |
| `worker/wrangler.toml` | `[vars] AI_PROVIDER = "deepseek"`, `[[d1_databases]]`, DO bindings |
| `worker/src/routes/profiles.ts` | Partner profile queries (diets, allergies, TDEE) used by chat context |
| `worker/src/routes/recipes.ts` | Save/delete saved recipes (GET, POST, DELETE) |

### Frontend

| File | Purpose |
|------|---------|
| `frontend/src/hooks/useMealChat.ts` | Chat state management, localStorage persistence, API calls |
| `frontend/src/pages/MealPlanTab.tsx` | `MealChatView` (chat UI), `InlineMealCard` (meal card in chat), `SavedRecipeCard` (expandable saved recipes) |
| `frontend/src/hooks/useRecipes.ts` | React Query hook for saved recipes (list, save, delete) |
| `frontend/src/hooks/useMealPlan.ts` | Old single-meal generator (deprecated, kept for compatibility) |
| `frontend/src/hooks/useWeekPlan.ts` | Week plan generation hook |
| `frontend/src/types/meal.ts` | TypeScript types: `GeneratedMeal`, `MealIngredient`, `PlatingInstruction` |
| `frontend/src/lib/api.ts` | `apiFetch()` — base HTTP helper with auth headers |
| `frontend/.env.production` | **Critical**: `VITE_API_URL=https://couples-food-system-api.byte-digital.workers.dev` |

## Required config

### Cloudflare Worker secrets (set in dashboard)

| Secret | Where to set | Required? | Purpose |
|--------|-------------|-----------|---------|
| `DEEPSEEK_KEY` | Worker → Settings → Variables → Add secret | **Yes** | API key for DeepSeek |
| `ALIBABA_KEY` | Same | No (fallback) | API key for Alibaba (unused if `AI_PROVIDER=deepseek`) |
| `ZAI_KEY` | Same | No (fallback) | API key for ZAI (unused if `AI_PROVIDER=deepseek`) |

### wrangler.toml

```toml
[vars]
AI_PROVIDER = "deepseek"       # Which provider to use
```

### Frontend env

```
# frontend/.env.production
VITE_API_URL=https://couples-food-system-api.byte-digital.workers.dev
VITE_WS_URL=wss://couples-food-system-api.byte-digital.workers.dev
```

## Model chain

```
Primary:   deepseek-v4-flash (only model used)
```

`callDeepSeekChat()` uses only `deepseek-v4-flash`. If it fails, returns `null` and `chatWithAI()` returns an error message. **No mock data is ever returned.** V4 Pro is never called to minimise cost.

The old `generateMeal()` function (used by `/meal-plan/generate` and week plan) also returns `null` on failure — no mock fallback.

## System prompt

The system prompt is built dynamically by `buildChatSystemPrompt()` in `ai.ts`. It includes:

- Full pantry list with quantities
- Partner 1: name, diet, allergies, TDEE target (if set)
- Partner 2: name, diet, allergies, TDEE target (if set)
- Instructions to respond with JSON only
- Rules: prioritize pantry, ask ONE question if ambiguous, mark `have: true/false`, include plating when both have TDEE

## Response parsing (JSON extraction)

`chatWithAI()` in `ai.ts` tries three strategies:

1. **Raw match** — `raw.match(/\{[\s\S]*\}/)` then `JSON.parse()`
2. **Markdown cleanup** — strip ````json` and ````` markers, then re-match
3. **Text fallback** — return `{ message: raw }` (no structured meal, just text)

If all parsing fails and the response is empty, returns an error message.

## Common issues & fixes

### "Failed to fetch" in chat

**Cause:** Frontend can't reach the worker API.

**Fix:**
1. Check `frontend/.env.production` has the correct `VITE_API_URL`
2. Verify the worker is deployed and accessible at that URL
3. Rebuild: `cd frontend && npm run build`
4. Redeploy: `npx wrangler pages deploy dist --project-name=cfs-app`

### Mock recipes showing (Chicken Stir-Fry, etc.)

**Cause 1:** Worker secrets missing. `generateMeal()` used to fall back to mock data.

**Fix (historical):** `MOCK_MEALS`, `generateMock()` and all mock fallback paths have been removed. The worker now returns `null` on failure. No code path can return mock data. If mock shows, the old worker code is still deployed. Redeploy the worker:

```bash
cd worker && npx wrangler deploy
```

**Cause 2:** Frontend Pages deployment is stale — old code still serving old UI that calls `/meal-plan/generate`.

**Fix:** Hard refresh (Ctrl+Shift+R) or redeploy Pages.

### Chat clears when switching tabs

**Cause:** `useMealChat` stores messages in localStorage. If clearing, check:
1. `loadMessages()` in `useMealChat.ts` reads from `localStorage.getItem('cooktwo_chat_messages')`
2. `saveMessages()` writes on every response

**Fix:** If conversation is lost, check localStorage in DevTools → Application → Local Storage for key `cooktwo_chat_messages`. If missing, something cleared it.

### Pages deployment shows old UI

**Cause:** `wrangler pages deploy` without rebuild, or CDN cache.

**Fix:**
```bash
cd frontend
npm run build
npx wrangler pages deploy dist --project-name=cfs-app
```
Then hard refresh the browser (Ctrl+Shift+R).

### AI responds with error "I couldn't reach the AI"

**Cause 1:** DeepSeek API key missing or invalid.
- Check: `DEEPSEEK_KEY` is set in Cloudflare dashboard
- Logs: `wrangler tail` will show "Missing API key" or API error responses

**Cause 2:** DeepSeek API is down or rate-limited.

**Fix:** Wait and try again. The error message tells the user to try again later.

### AI responds with text but no meal card

**Cause:** The AI response was parsed as plain text (JSON parsing failed).

**Check:** Worker logs show "Returning raw text as plain message (no structured meal data)".

**Fix:** Verify the AI is returning valid JSON. Check the system prompt format in `buildChatSystemPrompt()`.

## Deployment checklist

Deploy after any change to the AI system:

```bash
# 1. Rebuild frontend
cd frontend
npm run build

# 2. Deploy frontend to Pages
npx wrangler pages deploy dist --project-name=cfs-app

# 3. Deploy worker
cd ../worker
npx wrangler deploy
```

### Verify deployment

1. Open `https://cfs-app.pages.dev`
2. Go to Meals → Tonight
3. Type "Suggest a dinner" and wait for response
4. Check that a real meal card appears (not "Chicken Stir-Fry")
5. Switch to Saved tab and back — conversation should persist
6. Check DevTools → Network → the `/meal-chat` request returns 200

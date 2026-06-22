import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { HouseholdSync } from './durable-objects/HouseholdSync';
import { InviteStore } from './durable-objects/InviteStore';
import { readBearer, signToken, verifyToken, type TokenClaims } from './lib/jwt';
import { createPartner, getPartners, handleGetProfiles, handleUpdateProfile, updatePartner, type Diet } from './routes/profiles';
import { handleGetWeekPlan, handleGenerateWeekPlan, handleConfirmMeal } from './routes/mealplan';
import { handleGetRecipes, handleSaveRecipe, handleDeleteRecipe } from './routes/recipes';
import { handleMealChat } from './routes/mealChat';
import { handleGetActivity } from './routes/activity';
import { logToD1 } from './lib/activity';
import { handleSubscribe, handleVerify, handleValidateAccess } from './routes/waitlist';
import { handleListDiets, handleGetDiet, handleListArticles, handleGetArticle } from './routes/diet-info';
import { getCoupleDietRules } from './lib/diet-rules';
import { generateMeal, type GeneratedMeal } from './lib/ai';
import { generateMealImage } from './lib/image-gen';
import { parsePantryWithAI } from './lib/ai-pantry-parser';
import { getUsageState, withQuotaAI, withQuotaImage, tryReserveAI, refundAI, tryReserveImage, refundImage, checkPremiumGate } from './lib/usage';
import { isStripeConfigured, createCheckoutSession, createPortalSession, verifyAndParseWebhook, applyWebhookEvent, StripeNotConfiguredError, updateStripeCustomerId } from './lib/billing';
import type { Env } from './env';
import type { Category } from './durable-objects/HouseholdSync';

export { HouseholdSync, InviteStore };

async function verifyTokenForWs(
  secret: string,
  token: string,
  householdId: string,
): Promise<TokenClaims> {
  const claims = await verifyToken(secret, token);
  if (claims.householdId !== householdId) {
    throw new Error('household mismatch');
  }
  return claims;
}

const app = new Hono<{ Bindings: Env }>();

const LOCALHOST_PORTS = Array.from({ length: 20 }, (_, i) => `http://localhost:${5173 + i}`);
app.use('*', cors({
  origin: [
    ...LOCALHOST_PORTS,
    'http://127.0.0.1:5173',
    'https://cfs-app.pages.dev',
    'https://couples-food-system-v3.pages.dev',
    'https://cooktwo.app',
    'https://cooktwo.com',
  ],
  credentials: true,
}));

app.get('/', (c) =>
  c.json({
    name: 'couples-food-system-api',
    status: 'ok',
    stage: 3,
  }),
);

app.get('/health', (c) => c.text('ok'));

app.post('/api/waitlist/subscribe', (c) => handleSubscribe(c));
app.get('/api/waitlist/verify', (c) => handleVerify(c));
app.post('/api/waitlist/validate-access', (c) => handleValidateAccess(c));

// ─── Diet reference data (public, no auth) ────────────────────────────────────
app.get('/api/diets', (c) => handleListDiets(c));
app.get('/api/diets/:dietKey', (c) => handleGetDiet(c));
app.get('/api/diets/:dietKey/articles', (c) => handleListArticles(c));
app.get('/api/diets/:dietKey/articles/:fileSlug', (c) => handleGetArticle(c));

function getStub(c: Context<{ Bindings: Env }>, householdId: string): DurableObjectStub {
  const id = c.env.HOUSEHOLD_SYNC.idFromName(householdId);
  return c.env.HOUSEHOLD_SYNC.get(id);
}

function getInviteStub(c: Context<{ Bindings: Env }>): DurableObjectStub {
  const id = c.env.INVITE_STORE.idFromName('singleton');
  return c.env.INVITE_STORE.get(id);
}

async function requireAuth(c: Context<{ Bindings: Env }>): Promise<Response | null> {
  const claims = await readBearer(c.env.JWT_SECRET, c.req.raw);
  if (!claims) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  return null;
}

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function getTz(c: Context<{ Bindings: Env }>): string {
  return c.req.header('X-Timezone') || c.req.header('x-timezone') || 'UTC';
}

app.get('/api/billing/status', (c) => {
  return c.json({ configured: isStripeConfigured(c.env) });
});

app.post('/api/billing/stripe/webhook', async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header('stripe-signature') || '';
  if (!signature) return c.json({ error: 'missing signature' }, 400);

  try {
    const event = await verifyAndParseWebhook(c.env, rawBody, signature);
    await applyWebhookEvent(c.env, c.env.DB, event);
    return c.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'webhook error';
    console.error('Stripe webhook error:', message);
    return c.json({ error: message }, 400);
  }
});

app.get('/api/household/:id/usage', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const householdId = c.req.param('id') as string;
  const tz = getTz(c);
  const state = await getUsageState(c.env.DB, householdId, tz);
  return c.json(state);
});

app.post('/api/household/:id/billing/checkout', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const householdId = c.req.param('id') as string;
  const body = (await c.req.json().catch(() => ({}))) as { plan?: string };
  const plan = body.plan === 'yearly' ? 'yearly' : 'monthly';

  try {
    const { url } = await createCheckoutSession(
      c.env,
      householdId,
      plan,
      `${c.env.PWA_URL || 'https://cooktwo.app/PWA'}?upgraded=true`,
      `${c.env.PWA_URL || 'https://cooktwo.app/PWA'}`,
    );
    return c.json({ url });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return c.json({ error: 'Stripe not configured', code: 'stripe_not_configured' }, 503);
    }
    const message = err instanceof Error ? err.message : 'checkout error';
    return c.json({ error: message }, 500);
  }
});

app.post('/api/household/:id/billing/portal', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const householdId = c.req.param('id') as string;

  const sub = await c.env.DB.prepare(
    'SELECT stripe_customer_id FROM household_subscriptions WHERE household_id = ?'
  ).bind(householdId).first<{ stripe_customer_id: string | null }>();

  if (!sub?.stripe_customer_id) {
    return c.json({ error: 'No customer found' }, 404);
  }

  try {
    const { url } = await createPortalSession(
      c.env,
      sub.stripe_customer_id,
      `${c.env.PWA_URL || 'https://cooktwo.app/PWA'}`,
    );
    return c.json({ url });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return c.json({ error: 'Stripe not configured', code: 'stripe_not_configured' }, 503);
    }
    const message = err instanceof Error ? err.message : 'portal error';
    return c.json({ error: message }, 500);
  }
});

app.post('/api/household/create', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    displayName?: string;
    diet?: string;
    allergies?: string;
    allergens?: string[];
    goal?: string;
    weightKg?: number | null;
    heightCm?: number | null;
    age?: number | null;
    gender?: string | null;
    activityLevel?: string | null;
  };
  const displayName = (body.displayName ?? '').trim();
  if (!displayName) return jsonError('displayName is required', 400);

  const householdId = crypto.randomUUID();
  const partnerId = crypto.randomUUID();
  const slot = 1 as const;
  const now = Date.now();

  const placeholderCode = `__${crypto.randomUUID()}__`;
  await c.env.DB.prepare(
    `INSERT INTO households (id, invite_code, created_at) VALUES (?, ?, ?)`,
  )
    .bind(householdId, placeholderCode, now)
    .run();

  await createPartner(c.env.DB, householdId, partnerId, slot, displayName, body.allergens);

  if (body.diet || body.allergies || body.allergens || body.goal || body.weightKg || body.heightCm || body.age || body.gender || body.activityLevel) {
    await updatePartner(c.env.DB, partnerId, {
      diet: body.diet,
      allergies: body.allergies,
      goal: body.goal,
      weightKg: body.weightKg,
      heightCm: body.heightCm,
      age: body.age,
      gender: body.gender,
      activityLevel: body.activityLevel,
    });
  }

  const inviteStub = getInviteStub(c);
  const createRes = await inviteStub.fetch('https://do/codes', {
    method: 'POST',
    body: JSON.stringify({ householdId }),
    headers: { 'content-type': 'application/json' },
  });
  if (!createRes.ok) return jsonError('failed to create invite code', 500);
  const { code } = (await createRes.json()) as { code: string };

  await c.env.DB.prepare(
    'UPDATE households SET invite_code = ? WHERE id = ?',
  )
    .bind(code, householdId)
    .run();

  const token = await signToken(c.env.JWT_SECRET, { householdId, partnerId, slot, displayName, inviteCode: code });
  await logToD1(c.env.DB, {
    householdId,
    partnerId,
    partnerSlot: slot,
    partnerName: displayName,
    actionType: 'household_created',
    targetKind: 'household',
    targetId: householdId,
    targetName: displayName,
  }).catch((err) => console.error('activity log failed:', err));
  return c.json({
    householdId,
    inviteCode: code,
    token,
    partner: { id: partnerId, slot, displayName },
  });
});

app.post('/api/household/join', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    inviteCode?: string;
    displayName?: string;
    diet?: string;
    allergies?: string;
    allergens?: string[];
    goal?: string;
    weightKg?: number | null;
    heightCm?: number | null;
    age?: number | null;
    gender?: string | null;
    activityLevel?: string | null;
  };
  const inviteCode = (body.inviteCode ?? '').trim();
  const displayName = (body.displayName ?? '').trim();
  if (!inviteCode) return jsonError('inviteCode is required', 400);
  if (!/^\d{6}$/.test(inviteCode)) return jsonError('inviteCode must be 6 digits', 400);
  if (!displayName) return jsonError('displayName is required', 400);

  const inviteStub = getInviteStub(c);
  const lookupRes = await inviteStub.fetch(`https://do/codes/${inviteCode}`, { method: 'GET' });
  if (lookupRes.status === 404) return jsonError('invite code not found', 404);
  if (!lookupRes.ok) return jsonError('failed to look up invite code', 500);
  const { householdId } = (await lookupRes.json()) as { householdId: string };

  const partnerId = crypto.randomUUID();
  const slot = 2 as const;

  await createPartner(c.env.DB, householdId, partnerId, slot, displayName, body.allergens);

  if (body.diet || body.allergies || body.allergens || body.goal || body.weightKg || body.heightCm || body.age || body.gender || body.activityLevel) {
    await updatePartner(c.env.DB, partnerId, {
      diet: body.diet,
      allergies: body.allergies,
      goal: body.goal,
      weightKg: body.weightKg,
      heightCm: body.heightCm,
      age: body.age,
      gender: body.gender,
      activityLevel: body.activityLevel,
    });
  }

  const token = await signToken(c.env.JWT_SECRET, { householdId, partnerId, slot, displayName, inviteCode });
  await logToD1(c.env.DB, {
    householdId,
    partnerId,
    partnerSlot: slot,
    partnerName: displayName,
    actionType: 'partner_joined',
    targetKind: 'household',
    targetId: householdId,
    targetName: displayName,
  }).catch((err) => console.error('activity log failed:', err));
  return c.json({
    householdId,
    token,
    partner: { id: partnerId, slot, displayName },
  });
});

app.post('/api/household/link', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const claims = await readBearer(c.env.JWT_SECRET, c.req.raw);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);

  const body = (await c.req.json().catch(() => ({}))) as { inviteCode?: string };
  const inviteCode = (body.inviteCode ?? '').trim();
  if (!inviteCode) return jsonError('inviteCode is required', 400);
  if (!/^\d{6}$/.test(inviteCode)) return jsonError('inviteCode must be 6 digits', 400);

  if (inviteCode === claims.inviteCode) {
    return c.json({ error: 'That is your own code. Share it with your partner instead.' }, 400);
  }

  const inviteStub = getInviteStub(c);
  const lookupRes = await inviteStub.fetch(`https://do/codes/${inviteCode}`, { method: 'GET' });
  if (lookupRes.status === 404) return jsonError('invite code not found', 404);
  if (!lookupRes.ok) return jsonError('failed to look up invite code', 500);
  const { householdId: targetHouseholdId } = (await lookupRes.json()) as { householdId: string };

  const existingProfiles = await getPartners(c.env.DB, targetHouseholdId);
  if (existingProfiles.length >= 2) {
    return c.json({ error: 'This household already has 2 partners.' }, 409);
  }

  const newPartnerId = claims.partnerId;
  const newSlot = existingProfiles.length === 0 ? 1 : 2;

  await c.env.DB.prepare('DELETE FROM partners WHERE id = ?')
    .bind(newPartnerId)
    .run();

  await c.env.DB.prepare(
    `INSERT INTO partners (id, household_id, slot, name, diet, allergies, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      newPartnerId,
      targetHouseholdId,
      newSlot,
      claims.displayName,
      'omnivore',
      '',
      Date.now(),
      Date.now(),
    )
    .run();

  const newToken = await signToken(c.env.JWT_SECRET, {
    householdId: targetHouseholdId,
    partnerId: newPartnerId,
    slot: newSlot as 1 | 2,
    displayName: claims.displayName,
    inviteCode,
  });

  await logToD1(c.env.DB, {
    householdId: targetHouseholdId,
    partnerId: newPartnerId,
    partnerSlot: newSlot as 1 | 2,
    partnerName: claims.displayName,
    actionType: 'partner_linked',
    targetKind: 'household',
    targetId: targetHouseholdId,
    targetName: claims.displayName,
  }).catch((err) => console.error('activity log failed:', err));

  return c.json({
    householdId: targetHouseholdId,
    token: newToken,
    partner: { id: newPartnerId, slot: newSlot, displayName: claims.displayName },
  });
});

app.get('/api/household/:id/profiles', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  return handleGetProfiles(c);
});

app.put('/api/household/:id/profiles/:partnerId', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  return handleUpdateProfile(c);
});

app.get('/api/household/:id/items', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const stub = getStub(c, c.req.param('id'));
  return stub.fetch('https://do/items');
});

app.post('/api/household/:id/items', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const stub = getStub(c, c.req.param('id'));
  const body = await c.req.json();
  return stub.fetch('https://do/items', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
});

app.post('/api/household/:id/items/bulk', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const stub = getStub(c, c.req.param('id'));
  const body = await c.req.json();
  return stub.fetch('https://do/items/bulk', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
});

app.post('/api/household/:id/items/move-to-pantry', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const stub = getStub(c, c.req.param('id'));
  const body = await c.req.json();
  return stub.fetch('https://do/items/move-to-pantry', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
});

app.patch('/api/household/:id/items/:itemId/toggle', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const stub = getStub(c, c.req.param('id'));
  return stub.fetch(`https://do/items/${c.req.param('itemId')}/toggle`, {
    method: 'PATCH',
  });
});

app.delete('/api/household/:id/items/:itemId', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const stub = getStub(c, c.req.param('id'));
  return stub.fetch(`https://do/items/${c.req.param('itemId')}`, {
    method: 'DELETE',
  });
});

app.get('/api/household/:id/regulars', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const stub = getStub(c, c.req.param('id'));
  return stub.fetch('https://do/regulars');
});

app.get('/api/household/:id/pantry', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const stub = getStub(c, c.req.param('id'));
  return stub.fetch('https://do/pantry');
});

app.post('/api/household/:id/pantry', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const stub = getStub(c, c.req.param('id'));
  const body = await c.req.json();
  return stub.fetch('https://do/pantry', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
});

app.post('/api/household/:id/pantry/bulk', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const stub = getStub(c, c.req.param('id'));
  const body = await c.req.json();
  return stub.fetch('https://do/pantry/bulk', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
});

app.patch('/api/household/:id/items/:itemId', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const stub = getStub(c, c.req.param('id'));
  const body = await c.req.json();
  return stub.fetch(`https://do/items/${c.req.param('itemId')}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
});

app.delete('/api/household/:id/pantry/:itemId', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const stub = getStub(c, c.req.param('id'));
  return stub.fetch(`https://do/pantry/${c.req.param('itemId')}`, {
    method: 'DELETE',
  });
});

app.patch('/api/household/:id/pantry/:itemId', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const stub = getStub(c, c.req.param('id'));
  const body = await c.req.json();
  return stub.fetch(`https://do/pantry/${c.req.param('itemId')}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
});

app.post('/api/household/:id/push/subscribe', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const stub = getStub(c, c.req.param('id'));
  const body = await c.req.json();
  return stub.fetch('https://do/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
});

app.delete('/api/household/:id/push/unsubscribe', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const stub = getStub(c, c.req.param('id'));
  const body = await c.req.json();
  return stub.fetch('https://do/push/unsubscribe', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
});

app.post('/api/household/:id/reclassify', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;

  const householdId = c.req.param('id') as string;
  const tz = getTz(c);

  const reserved = await tryReserveAI(c.env.DB, householdId, tz, 1);
  if (!reserved) {
    return c.json({ error: 'quota_exceeded', message: 'No AI requests left for today. Upgrade for 70/day.', code: 'quota_exceeded' }, 402);
  }

  try {
    const body = (await c.req.json().catch(() => ({}))) as { scope?: 'pantry' | 'items' | 'all' };
    const scope = body.scope || 'all';
    const stub = getStub(c, householdId);

    const provider = (c.env.AI_PROVIDER || 'deepseek') as 'deepseek' | 'alibaba' | 'zai';
    const apiKey = (c.env as unknown as Record<string, unknown>)[
      provider === 'alibaba' ? 'ALIBABA_KEY' : provider === 'zai' ? 'ZAI_KEY' : 'DEEPSEEK_KEY'
    ] as string;

    if (!apiKey) {
      await refundAI(c.env.DB, householdId, 1);
      return c.json({ error: 'AI not configured' }, 503);
    }

  const updatedItems: Array<{ id: string; type: 'pantry' | 'item'; category: Category; isFood: boolean; name: string }> = [];

  if (scope === 'all' || scope === 'items') {
    const itemsRes = await stub.fetch('https://do/items');
    const items = (await itemsRes.json()) as Array<{ id: string; name: string; needsReview: boolean; category: string }>;
    const reviewItems = items.filter((i) => i.needsReview || i.category === 'Other');

    if (reviewItems.length > 0) {
      const aiInputs = reviewItems.map((i) => i.name);
      try {
        const aiResults = await parsePantryWithAI(aiInputs, apiKey);
        for (let j = 0; j < reviewItems.length; j++) {
          const item = reviewItems[j]!;
          const aiResult = aiResults[j];
          if (aiResult && aiResult.category !== item.category) {
            const patchRes = await stub.fetch(`https://do/items/${item.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ category: aiResult.category, isFood: aiResult.isFood, needsReview: false }),
              headers: { 'content-type': 'application/json' },
            });
            if (patchRes.ok) {
              const patched = (await patchRes.json()) as { id: string; category: Category; isFood: boolean; name: string };
              updatedItems.push({ id: patched.id, type: 'item', category: patched.category, isFood: patched.isFood, name: patched.name });
            }
          } else if (aiResult) {
            await stub.fetch(`https://do/items/${item.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ needsReview: false }),
              headers: { 'content-type': 'application/json' },
            });
          }
        }
      } catch (err) {
        console.error('AI reclassification failed for items:', err);
      }
    }
  }

  if (scope === 'all' || scope === 'pantry') {
    const pantryRes = await stub.fetch('https://do/pantry');
    const pantryItems = (await pantryRes.json()) as Array<{ id: string; name: string; needsReview: boolean; category: string }>;
    const reviewItems = pantryItems.filter((i) => i.needsReview || i.category === 'Other');

    if (reviewItems.length > 0) {
      const aiInputs = reviewItems.map((i) => i.name);
      try {
        const aiResults = await parsePantryWithAI(aiInputs, apiKey);
        for (let j = 0; j < reviewItems.length; j++) {
          const item = reviewItems[j]!;
          const aiResult = aiResults[j];
          if (aiResult && aiResult.category !== item.category) {
            const patchRes = await stub.fetch(`https://do/pantry/${item.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ category: aiResult.category, isFood: aiResult.isFood, needsReview: false, name: aiResult.name }),
              headers: { 'content-type': 'application/json' },
            });
            if (patchRes.ok) {
              const patched = (await patchRes.json()) as { id: string; category: Category; isFood: boolean; name: string };
              updatedItems.push({ id: patched.id, type: 'pantry', category: patched.category, isFood: patched.isFood, name: patched.name });
            }
          } else if (aiResult) {
            await stub.fetch(`https://do/pantry/${item.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ needsReview: false, name: aiResult.name }),
              headers: { 'content-type': 'application/json' },
            });
          }
        }
      } catch (err) {
        console.error('AI reclassification failed for pantry:', err);
      }
    }
  }

    return c.json({ reclassified: updatedItems, count: updatedItems.length });
  } catch (err) {
    await refundAI(c.env.DB, householdId, 1);
    throw err;
  }
});

app.post('/api/household/:id/meal-plan/generate', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;

  const householdId = c.req.param('id') as string;
  const tz = getTz(c);

  const reserved = await tryReserveAI(c.env.DB, householdId, tz, 1);
  if (!reserved) {
    return c.json({ error: 'quota_exceeded', message: 'No AI requests left for today. Upgrade for 70/day.', code: 'quota_exceeded' }, 402);
  }

  try {
    const profiles = await getPartners(c.env.DB, householdId);

    const pantryRes = await getStub(c, householdId).fetch('https://do/pantry');
    const pantryItems = (await pantryRes.json()) as Array<{ name: string; quantity: string }>;

    const p1 = profiles.find((p) => p.slot === 1);
    const p2 = profiles.find((p) => p.slot === 2);
    const p1Diet = p1?.diet ?? 'omnivore';
    const p2Diet = p2?.diet ?? 'omnivore';
    const p1Allergens = p1?.allergens ?? [];
    const p2Allergens = p2?.allergens ?? [];
    const p1Goal = p1?.goal ?? null;
    const p2Goal = p2?.goal ?? null;

    const p1Body = p1?.tdee ? { name: p1.name, tdee: p1.tdee } : undefined;
    const p2Body = p2?.tdee ? { name: p2.name, tdee: p2.tdee } : undefined;

    const p1Fasting = p1?.fastingMode ?? null;
    const p2Fasting = p2?.fastingMode ?? null;
    const dietRules = await getCoupleDietRules(c.env.DB, p1Diet, p2Diet, p1Fasting, p2Fasting);

    const meal = await generateMeal(c.env, pantryItems, p1Diet, p2Diet, p1Allergens, p2Allergens, p1Goal, p2Goal, p1Body, p2Body, profiles.map((p) => ({ name: p.name, diet: p.diet as Diet, allergens: p.allergens, tdee: p.tdee, goal: p.goal, activityLevel: p.activityLevel, slot: p.slot as 1 | 2 })), dietRules.promptBlock, dietRules.combinedClassifierTerms, dietRules.combinedRestrictedGroups);
    if (!meal) {
      await refundAI(c.env.DB, householdId, 1);
      return c.json({ error: 'AI meal generation failed. Please try again later.' }, 503);
    }
    return c.json(meal);
  } catch (err) {
    await refundAI(c.env.DB, householdId, 1);
    throw err;
  }
});

app.get('/api/household/:id/meal-plan/week', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  return handleGetWeekPlan(c);
});

app.post('/api/household/:id/meal-plan/week/generate', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const householdId = c.req.param('id') as string;
  const tz = getTz(c);

  const reserved = await tryReserveAI(c.env.DB, householdId, tz, 7);
  if (!reserved) {
    return c.json({ error: 'quota_exceeded', message: 'Not enough AI requests. Need 7 to generate a full week. Upgrade for 70/day.', code: 'quota_exceeded' }, 402);
  }

  try {
    return await handleGenerateWeekPlan(c);
  } catch (err) {
    await refundAI(c.env.DB, householdId, 7);
    throw err;
  }
});

app.post('/api/household/:id/meal-plan/confirm', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  return handleConfirmMeal(c);
});

app.post('/api/household/:id/meal-chat', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const householdId = c.req.param('id') as string;
  const tz = getTz(c);

  const reserved = await tryReserveAI(c.env.DB, householdId, tz, 1);
  if (!reserved) {
    return c.json({ error: 'quota_exceeded', message: 'No AI requests left for today. Upgrade for 70/day.', code: 'quota_exceeded' }, 402);
  }

  try {
    return await handleMealChat(c);
  } catch (err) {
    await refundAI(c.env.DB, householdId, 1);
    throw err;
  }
});

app.post('/api/household/:id/meal-image', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;

  const householdId = c.req.param('id') as string;
  const tz = getTz(c);

  const tier = await checkPremiumGate(c.env.DB, householdId);
  if (tier !== 'premium') {
    return c.json({ error: 'premium_only', message: 'Image generation is a Premium feature.', code: 'premium_only' }, 403);
  }

  const reserved = await tryReserveImage(c.env.DB, householdId, tz);
  if (!reserved) {
    return c.json({ error: 'image_quota_exceeded', message: 'You\'ve used all 3 image generations for today. Resets at midnight.', code: 'image_quota_exceeded' }, 403);
  }

  try {
    const meal = await c.req.json<GeneratedMeal>();
    if (!meal.name) {
      await refundImage(c.env.DB, householdId);
      return jsonError('meal name is required', 400);
    }

    const url = await generateMealImage(c.env, meal);
    if (!url) {
      await refundImage(c.env.DB, householdId);
      return c.json({ error: 'Image generation failed. Please try again later.' }, 503);
    }

    return c.json({ url });
  } catch (err) {
    await refundImage(c.env.DB, householdId);
    throw err;
  }
});

app.get('/api/household/:id/recipes', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  return handleGetRecipes(c);
});

app.post('/api/household/:id/recipes', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  return handleSaveRecipe(c);
});

app.delete('/api/household/:id/recipes/:recipeId', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  return handleDeleteRecipe(c);
});

app.get('/api/household/:id/activity', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  return handleGetActivity(c);
});

app.get('/api/household/:id/ws', async (c) => {
  const householdId = c.req.param('id');
  if (c.req.header('Upgrade') !== 'websocket') {
    return c.text('expected websocket upgrade', 426);
  }
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'unauthorized' }, 401);
  let claims;
  try {
    claims = await verifyTokenForWs(c.env.JWT_SECRET, token, householdId);
  } catch {
    return c.json({ error: 'unauthorized' }, 401);
  }
  const stub = getStub(c, householdId);
  const partnerId = claims.partnerId;
  const slot = String(claims.slot);
  return stub.fetch(`https://do/ws?partnerId=${encodeURIComponent(partnerId)}&slot=${slot}`, {
    headers: c.req.raw.headers,
  });
});

export default app;

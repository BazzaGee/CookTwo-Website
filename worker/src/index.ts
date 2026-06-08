import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { HouseholdSync } from './durable-objects/HouseholdSync';
import { InviteStore } from './durable-objects/InviteStore';
import { readBearer, signToken, verifyToken, type TokenClaims } from './lib/jwt';
import { createPartner, getPartners, handleGetProfiles, handleUpdateProfile, updatePartner } from './routes/profiles';
import { handleGetWeekPlan, handleGenerateWeekPlan, handleConfirmMeal } from './routes/mealplan';
import { handleGetRecipes, handleSaveRecipe } from './routes/recipes';
import { handleMealChat } from './routes/mealChat';
import { generateMeal, type GeneratedMeal } from './lib/ai';
import type { Env } from './env';

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

app.use('*', cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'https://cfs-app.pages.dev'],
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

app.post('/api/household/create', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    displayName?: string;
    diet?: string;
    allergies?: string;
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

  await c.env.DB.prepare(
    `INSERT INTO households (id, invite_code, created_at) VALUES (?, ?, ?)`,
  )
    .bind(householdId, '__PLACEHOLDER__', now)
    .run();

  await createPartner(c.env.DB, householdId, partnerId, slot, displayName);

  if (body.diet || body.allergies || body.goal || body.weightKg || body.heightCm || body.age || body.gender || body.activityLevel) {
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

  await createPartner(c.env.DB, householdId, partnerId, slot, displayName);

  if (body.diet || body.allergies || body.goal || body.weightKg || body.heightCm || body.age || body.gender || body.activityLevel) {
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

app.delete('/api/household/:id/pantry/:itemId', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const stub = getStub(c, c.req.param('id'));
  return stub.fetch(`https://do/pantry/${c.req.param('itemId')}`, {
    method: 'DELETE',
  });
});

app.post('/api/household/:id/meal-plan/generate', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;

  const householdId = c.req.param('id') as string;
  const profiles = await getPartners(c.env.DB, householdId);

  const pantryRes = await getStub(c, householdId).fetch('https://do/pantry');
  const pantryItems = (await pantryRes.json()) as Array<{ name: string; quantity: string }>;

  const p1 = profiles.find((p) => p.slot === 1);
  const p2 = profiles.find((p) => p.slot === 2);
  const p1Diet = p1?.diet ?? 'omnivore';
  const p2Diet = p2?.diet ?? 'omnivore';

  const p1Body = p1?.tdee ? { name: p1.name, tdee: p1.tdee } : undefined;
  const p2Body = p2?.tdee ? { name: p2.name, tdee: p2.tdee } : undefined;

  const meal = await generateMeal(c.env, pantryItems, p1Diet, p2Diet, p1Body, p2Body);
  return c.json(meal);
});

app.get('/api/household/:id/meal-plan/week', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  return handleGetWeekPlan(c);
});

app.post('/api/household/:id/meal-plan/week/generate', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  return handleGenerateWeekPlan(c);
});

app.post('/api/household/:id/meal-plan/confirm', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  return handleConfirmMeal(c);
});

app.post('/api/household/:id/meal-chat', async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  return handleMealChat(c);
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

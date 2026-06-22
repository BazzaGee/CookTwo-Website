import type { Context } from 'hono';
import type { Env } from '../env';
import { calculateTDEE, type BodyProfile, type TDEEResult } from '../lib/tdee';
import { logToD1 } from '../lib/activity';
import { readBearer } from '../lib/jwt';

export type Diet = 'omnivore' | 'vegetarian' | 'vegan' | 'pescatarian' | 'keto' | 'paleo' | 'gluten-free';
export type Gender = 'male' | 'female' | 'other';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'lose' | 'maintain' | 'gain';

export interface PartnerProfile {
  id: string;
  householdId: string;
  slot: 1 | 2;
  name: string;
  diet: Diet;
  fastingMode: string | null;
  allergies: string;          // kept for backward compat, deprecated
  allergens: string[];         // structured list from partner_allergens table
  createdAt: number;
  updatedAt: number;
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  gender: Gender | null;
  activityLevel: ActivityLevel | null;
  goal: Goal | null;
  tdee: TDEEResult | null;
}

interface PartnerRow {
  id: string;
  household_id: string;
  slot: number;
  name: string;
  diet: string;
  fasting_mode: string | null;
  allergies: string;
  created_at: number;
  updated_at: number;
  weight_kg: number | null;
  height_cm: number | null;
  age: number | null;
  gender: string | null;
  activity_level: string | null;
  goal: string | null;
}

async function getPartnerAllergens(db: D1Database, partnerId: string): Promise<string[]> {
  const { results } = await db.prepare(
    'SELECT allergen FROM partner_allergens WHERE partner_id = ? ORDER BY allergen ASC',
  )
    .bind(partnerId)
    .all<{ allergen: string }>();
  return (results ?? []).map((r) => r.allergen);
}

function rowToProfile(row: PartnerRow): PartnerProfile {
  const profile: PartnerProfile = {
    id: row.id,
    householdId: row.household_id,
    slot: row.slot as 1 | 2,
    name: row.name,
    diet: row.diet as Diet,
    fastingMode: row.fasting_mode ?? null,
    allergies: row.allergies,
    allergens: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    weightKg: row.weight_kg,
    heightCm: row.height_cm,
    age: row.age,
    gender: row.gender as Gender | null,
    activityLevel: row.activity_level as ActivityLevel | null,
    goal: row.goal as Goal | null,
    tdee: null,
  };

  if (profile.weightKg && profile.heightCm && profile.age && profile.gender && profile.activityLevel && profile.goal) {
    profile.tdee = calculateTDEE({
      weightKg: profile.weightKg,
      heightCm: profile.heightCm,
      age: profile.age,
      gender: profile.gender,
      activityLevel: profile.activityLevel,
      goal: profile.goal,
    });
  }

  return profile;
}

export async function createPartner(
  db: D1Database,
  householdId: string,
  partnerId: string,
  slot: 1 | 2,
  name: string,
  allergens?: string[],
): Promise<PartnerProfile> {
  const now = Date.now();
  await db.prepare(
    `INSERT INTO partners (id, household_id, slot, name, diet, allergies, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'omnivore', '', ?, ?)`,
  )
    .bind(partnerId, householdId, slot, name, now, now)
    .run();

  if (allergens && allergens.length > 0) {
    const insertAllergen = db.prepare(
      'INSERT OR IGNORE INTO partner_allergens (partner_id, allergen, severity, added_at) VALUES (?, ?, ?, ?)',
    );
    for (const a of allergens) {
      const cleaned = a.trim().toLowerCase();
      if (cleaned) {
        await insertAllergen.bind(partnerId, cleaned, 'strict', now).run();
      }
    }
  }

  return {
    id: partnerId,
    householdId,
    slot,
    name,
    diet: 'omnivore',
    fastingMode: null,
    allergies: (allergens ?? []).join(', '),
    allergens: allergens ?? [],
    createdAt: now,
    updatedAt: now,
    weightKg: null,
    heightCm: null,
    age: null,
    gender: null,
    activityLevel: null,
    goal: null,
    tdee: null,
  };
}

export async function getPartners(
  db: D1Database,
  householdId: string,
): Promise<PartnerProfile[]> {
  const { results } = await db.prepare(
    'SELECT * FROM partners WHERE household_id = ? ORDER BY slot ASC',
  )
    .bind(householdId)
    .all<PartnerRow>();
  const profiles = (results ?? []).map(rowToProfile);

  for (const profile of profiles) {
    profile.allergens = await getPartnerAllergens(db, profile.id);
  }

  return profiles;
}

async function replacePartnerAllergens(db: D1Database, partnerId: string, allergens: string[]): Promise<void> {
  await db.prepare('DELETE FROM partner_allergens WHERE partner_id = ?').bind(partnerId).run();
  if (allergens.length === 0) return;
  const now = Date.now();
  const insertAllergen = db.prepare(
    'INSERT INTO partner_allergens (partner_id, allergen, severity, added_at) VALUES (?, ?, ?, ?)',
  );
  for (const a of allergens) {
    const cleaned = a.trim().toLowerCase();
    if (cleaned) {
      await insertAllergen.bind(partnerId, cleaned, 'strict', now).run();
    }
  }
}

export async function updatePartner(
  db: D1Database,
  partnerId: string,
  updates: {
    name?: string; diet?: string; fastingMode?: string | null; allergies?: string; allergens?: string[];
    weightKg?: number | null; heightCm?: number | null; age?: number | null;
    gender?: string | null; activityLevel?: string | null; goal?: string | null;
  },
): Promise<PartnerProfile | null> {
  const now = Date.now();
  const existing = await db.prepare(
    'SELECT * FROM partners WHERE id = ?',
  )
    .bind(partnerId)
    .first<PartnerRow>();

  if (!existing) return null;

  const name = updates.name ?? existing.name;
  const diet = updates.diet ?? existing.diet;
  const fastingMode = updates.fastingMode !== undefined ? updates.fastingMode : existing.fasting_mode;
  const allergies = updates.allergies ?? existing.allergies;
  const weightKg = updates.weightKg !== undefined ? updates.weightKg : existing.weight_kg;
  const heightCm = updates.heightCm !== undefined ? updates.heightCm : existing.height_cm;
  const age = updates.age !== undefined ? updates.age : existing.age;
  const gender = updates.gender !== undefined ? updates.gender : existing.gender;
  const activityLevel = updates.activityLevel !== undefined ? updates.activityLevel : existing.activity_level;
  const goal = updates.goal !== undefined ? updates.goal : existing.goal;

  await db.prepare(
    `UPDATE partners SET name = ?, diet = ?, fasting_mode = ?, allergies = ?, weight_kg = ?, height_cm = ?, age = ?, gender = ?, activity_level = ?, goal = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(name, diet, fastingMode, allergies, weightKg, heightCm, age, gender, activityLevel, goal, now, partnerId)
    .run();

  if (updates.allergens !== undefined) {
    const cleaned = updates.allergens.map((a) => a.trim().toLowerCase()).filter(Boolean);
    const deduped = [...new Set(cleaned)];
    const textAllergies = deduped.join(', ');
    await replacePartnerAllergens(db, partnerId, deduped);
    await db.prepare('UPDATE partners SET allergies = ? WHERE id = ?').bind(textAllergies, partnerId).run();
    const currentAllergens = deduped;
    const rowToReturn: PartnerRow = {
      ...existing,
      name, diet, allergies: textAllergies,
      weight_kg: weightKg, height_cm: heightCm, age, gender, activity_level: activityLevel, goal,
      updated_at: now,
    };
    const profile = rowToProfile(rowToReturn);
    profile.allergens = currentAllergens;
    return profile;
  }

  return rowToProfile({
    ...existing,
    name, diet, allergies, weight_kg: weightKg, height_cm: heightCm, age, gender, activity_level: activityLevel, goal,
    updated_at: now,
  });
}

export async function handleGetProfiles(c: Context<{ Bindings: Env }>) {
  const householdId = c.req.param('id') as string;
  const profiles = await getPartners(c.env.DB, householdId);
  return c.json(profiles);
}

export async function handleUpdateProfile(c: Context<{ Bindings: Env }>) {
  const householdId = c.req.param('id') as string;
  const partnerId = c.req.param('partnerId') as string;
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    diet?: string;
    fastingMode?: string | null;
    allergies?: string;
    allergens?: string[];
    weightKg?: number | null;
    heightCm?: number | null;
    age?: number | null;
    gender?: string | null;
    activityLevel?: string | null;
    goal?: string | null;
  };

  const profile = await updatePartner(c.env.DB, partnerId, {
    name: body.name?.trim(),
    diet: body.diet,
    fastingMode: body.fastingMode,
    allergies: body.allergies,
    allergens: body.allergens,
    weightKg: body.weightKg,
    heightCm: body.heightCm,
    age: body.age,
    gender: body.gender,
    activityLevel: body.activityLevel,
    goal: body.goal,
  });

  if (!profile) return c.json({ error: 'partner_not_found' }, 404);

  const claims = await readBearer(c.env.JWT_SECRET, c.req.raw);
  const changedFields = Object.keys(body).filter((k) => body[k as keyof typeof body] !== undefined);
  await logToD1(c.env.DB, {
    householdId,
    partnerId,
    partnerSlot: profile.slot,
    partnerName: profile.name,
    actionType: 'profile_updated',
    targetKind: 'profile',
    targetId: partnerId,
    targetName: profile.name,
    payload: { changedFields },
  }).catch((err) => console.error('activity log failed:', err));

  return c.json(profile);
}

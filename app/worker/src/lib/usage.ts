import type { Env } from '../env';

export const QUOTAS = { free: 10, premium: 70 } as const;
export const IMAGE_QUOTAS = { free: 0, premium: 3 } as const;

export interface UsageState {
  tier: 'free' | 'premium';
  usedToday: number;
  dailyQuota: number;
  imagesUsedToday: number;
  dailyImageQuota: number;
  remaining: number;
  imagesRemaining: number;
  resetsAt: string;
  planPeriod: 'monthly' | 'yearly' | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}

function todayLocalIn(tz: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

function nextMidnightIn(tz: string): number {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  const localNow = new Date(
    Number(get('year')),
    Number(get('month')) - 1,
    Number(get('day')),
    Number(get('hour')),
    Number(get('minute')),
    Number(get('second')),
  );
  const tomorrow = new Date(localNow);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.getTime() - localNow.getTime();
}

async function getOrInitSubscription(
  db: D1Database,
  householdId: string,
  timezone?: string,
): Promise<{
  tier: string;
  daily_quota: number;
  daily_image_quota: number;
  used_today: number;
  images_used_today: number;
  last_reset_date: string | null;
  timezone: string;
  plan_period: string | null;
  current_period_end: number | null;
  cancel_at_period_end: number;
}> {
  const existing = await db.prepare('SELECT * FROM household_subscriptions WHERE household_id = ?')
    .bind(householdId)
    .first<{
      tier: string;
      daily_quota: number;
      daily_image_quota: number;
      used_today: number;
      images_used_today: number;
      last_reset_date: string | null;
      timezone: string;
      plan_period: string | null;
      current_period_end: number | null;
      cancel_at_period_end: number;
    }>();

  if (existing) return existing;

  const now = Date.now();
  const tz = timezone || 'UTC';
  await db.prepare(
    `INSERT INTO household_subscriptions (household_id, tier, timezone, daily_quota, daily_image_quota, created_at, updated_at)
     VALUES (?, 'free', ?, 10, 0, ?, ?)`,
  )
    .bind(householdId, tz, now, now)
    .run();

  return {
    tier: 'free',
    daily_quota: 10,
    daily_image_quota: 0,
    used_today: 0,
    images_used_today: 0,
    last_reset_date: null,
    timezone: tz,
    plan_period: null,
    current_period_end: null,
    cancel_at_period_end: 0,
  };
}

async function maybeRolloverDay(
  db: D1Database,
  householdId: string,
  tz: string,
): Promise<{ reset: boolean }> {
  const today = todayLocalIn(tz);
  const sub = await getOrInitSubscription(db, householdId, tz);

  if (sub.last_reset_date === today) return { reset: false };

  await db.prepare(
    `UPDATE household_subscriptions
        SET used_today = 0,
            images_used_today = 0,
            last_reset_date = ?,
            timezone = ?,
            updated_at = ?
      WHERE household_id = ?`,
  )
    .bind(today, tz, Date.now(), householdId)
    .run();

  return { reset: true };
}

export async function tryReserveAI(
  db: D1Database,
  householdId: string,
  tz: string,
  cost: number,
): Promise<boolean> {
  await maybeRolloverDay(db, householdId, tz);
  const today = todayLocalIn(tz);

  const result = await db.prepare(
    `UPDATE household_subscriptions
        SET used_today = used_today + ?,
            updated_at = ?
      WHERE household_id = ?
        AND (used_today + ?) <= daily_quota
        AND (last_reset_date = ? OR last_reset_date IS NULL)`,
  )
    .bind(cost, Date.now(), householdId, cost, today)
    .run();

  return result.meta.changes > 0;
}

export async function tryReserveImage(
  db: D1Database,
  householdId: string,
  tz: string,
): Promise<boolean> {
  await maybeRolloverDay(db, householdId, tz);
  const today = todayLocalIn(tz);

  const result = await db.prepare(
    `UPDATE household_subscriptions
        SET images_used_today = images_used_today + 1,
            updated_at = ?
      WHERE household_id = ?
        AND images_used_today < daily_image_quota
        AND tier = 'premium'
        AND (last_reset_date = ? OR last_reset_date IS NULL)`,
  )
    .bind(Date.now(), householdId, today)
    .run();

  return result.meta.changes > 0;
}

export async function refundAI(
  db: D1Database,
  householdId: string,
  cost: number,
): Promise<void> {
  await db.prepare(
    `UPDATE household_subscriptions
        SET used_today = MAX(0, used_today - ?),
            updated_at = ?
      WHERE household_id = ?`,
  )
    .bind(cost, Date.now(), householdId)
    .run();
}

export async function refundImage(
  db: D1Database,
  householdId: string,
): Promise<void> {
  await db.prepare(
    `UPDATE household_subscriptions
        SET images_used_today = MAX(0, images_used_today - 1),
            updated_at = ?
      WHERE household_id = ?`,
  )
    .bind(Date.now(), householdId)
    .run();
}

export async function getUsageState(
  db: D1Database,
  householdId: string,
  tz: string,
): Promise<UsageState> {
  await maybeRolloverDay(db, householdId, tz);
  const sub = await getOrInitSubscription(db, householdId, tz);

  const msToMidnight = nextMidnightIn(tz);
  const resetsAt = new Date(Date.now() + msToMidnight).toISOString();

  return {
    tier: sub.tier as 'free' | 'premium',
    usedToday: sub.used_today,
    dailyQuota: sub.daily_quota,
    imagesUsedToday: sub.images_used_today,
    dailyImageQuota: sub.daily_image_quota,
    remaining: sub.daily_quota - sub.used_today,
    imagesRemaining: sub.daily_image_quota - sub.images_used_today,
    resetsAt,
    planPeriod: sub.plan_period as 'monthly' | 'yearly' | null,
    currentPeriodEnd: sub.current_period_end,
    cancelAtPeriodEnd: sub.cancel_at_period_end === 1,
  };
}

export async function checkPremiumGate(
  db: D1Database,
  householdId: string,
): Promise<'premium' | 'free'> {
  const sub = await getOrInitSubscription(db, householdId);
  return sub.tier === 'premium' ? 'premium' : 'free';
}

export async function withQuotaAI<T>(
  db: D1Database,
  householdId: string,
  tz: string,
  cost: number,
  fn: () => Promise<T>,
): Promise<{ result: T } | { error: 'quota_exceeded'; usedToday: number; dailyQuota: number }> {
  const reserved = await tryReserveAI(db, householdId, tz, cost);
  if (!reserved) {
    const state = await getUsageState(db, householdId, tz);
    return { error: 'quota_exceeded', usedToday: state.usedToday + cost, dailyQuota: state.dailyQuota };
  }

  try {
    const result = await fn();
    return { result };
  } catch (err) {
    await refundAI(db, householdId, cost);
    throw err;
  }
}

export async function withQuotaImage<T>(
  db: D1Database,
  householdId: string,
  tz: string,
  fn: () => Promise<T>,
): Promise<
  { result: T }
  | { error: 'premium_only' }
  | { error: 'image_quota_exceeded'; usedToday: number; dailyQuota: number }
> {
  const tier = await checkPremiumGate(db, householdId);
  if (tier !== 'premium') return { error: 'premium_only' };

  const reserved = await tryReserveImage(db, householdId, tz);
  if (!reserved) {
    const state = await getUsageState(db, householdId, tz);
    return { error: 'image_quota_exceeded', usedToday: state.imagesUsedToday + 1, dailyQuota: state.dailyImageQuota };
  }

  try {
    const result = await fn();
    return { result };
  } catch (err) {
    await refundImage(db, householdId);
    throw err;
  }
}

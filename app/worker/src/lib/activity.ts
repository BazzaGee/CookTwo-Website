export type ActivityTargetKind =
  | 'grocery_item'
  | 'pantry_item'
  | 'meal'
  | 'recipe'
  | 'profile'
  | 'household';

export interface ActivityEntry {
  id: string;
  householdId: string;
  partnerId: string | null;
  partnerSlot: 1 | 2 | null;
  partnerName: string | null;
  actionType: string;
  targetKind: ActivityTargetKind;
  targetId: string | null;
  targetName: string | null;
  payload: string | null;
  createdAt: number;
}

interface ActivityRow {
  id: string;
  household_id: string;
  partner_id: string | null;
  partner_slot: number | null;
  partner_name: string | null;
  action_type: string;
  target_kind: string;
  target_id: string | null;
  target_name: string | null;
  payload: string | null;
  created_at: number;
}

export function rowToActivity(row: ActivityRow): ActivityEntry {
  return {
    id: row.id,
    householdId: row.household_id,
    partnerId: row.partner_id,
    partnerSlot: (row.partner_slot === 1 || row.partner_slot === 2) ? row.partner_slot : null,
    partnerName: row.partner_name,
    actionType: row.action_type,
    targetKind: row.target_kind as ActivityTargetKind,
    targetId: row.target_id,
    targetName: row.target_name,
    payload: row.payload,
    createdAt: row.created_at,
  };
}

export interface LogActivityInput {
  householdId: string;
  partnerId?: string | null;
  partnerSlot?: 1 | 2 | null;
  partnerName?: string | null;
  actionType: string;
  targetKind: ActivityTargetKind;
  targetId?: string | null;
  targetName?: string | null;
  payload?: unknown | null;
}

export async function logToD1(db: D1Database, input: LogActivityInput): Promise<void> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.prepare(
    `INSERT INTO activity_log
      (id, household_id, partner_id, partner_slot, partner_name, action_type, target_kind, target_id, target_name, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.householdId,
      input.partnerId ?? null,
      input.partnerSlot ?? null,
      input.partnerName ?? null,
      input.actionType,
      input.targetKind,
      input.targetId ?? null,
      input.targetName ?? null,
      input.payload != null ? JSON.stringify(input.payload) : null,
      now,
    )
    .run();
}

export async function getActivityFromD1(
  db: D1Database,
  householdId: string,
  limit: number,
  before?: number,
): Promise<ActivityEntry[]> {
  const cappedLimit = Math.min(Math.max(limit, 1), 200);
  if (before !== undefined) {
    const { results } = await db.prepare(
      `SELECT * FROM activity_log WHERE household_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?`,
    )
      .bind(householdId, before, cappedLimit)
      .all<ActivityRow>();
    return (results ?? []).map(rowToActivity);
  }
  const { results } = await db.prepare(
    `SELECT * FROM activity_log WHERE household_id = ? ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(householdId, cappedLimit)
    .all<ActivityRow>();
  return (results ?? []).map(rowToActivity);
}

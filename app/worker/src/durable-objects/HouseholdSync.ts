import type { Env } from '../env';
import { parsePantryItemSync, type ParsedPantryItem } from '../lib/pantry-parser';
import type { PushProvider, PushPayload } from '../lib/push-provider';
import { WebPushProvider } from '../lib/push-web';
import type { GeneratedMeal } from '../lib/ai';

export type Category = 'Produce' | 'Meat' | 'Dairy' | 'Pantry' | 'Household' | 'Personal Care' | 'Other';

export type PartnerSlot = 1 | 2;

export interface GroceryItem {
  id: string;
  householdId: string;
  name: string;
  category: Category;
  isChecked: boolean;
  isFood: boolean;
  brand: string;
  needsReview: boolean;
  addedByPartnerId: string;
  addedByPartnerSlot: PartnerSlot;
  createdAt: number;
  updatedAt: number;
}

export interface PantryItem {
  id: string;
  householdId: string;
  name: string;
  quantity: string;
  category: Category;
  quantityValue: number | null;
  quantityUnit: string;
  brand: string;
  isFood: boolean;
  needsReview: boolean;
  addedByPartnerId: string;
  addedByPartnerSlot: PartnerSlot;
  createdAt: number;
}

export type SyncEvent =
  | { type: 'item_added'; item: GroceryItem }
  | { type: 'items_added'; items: GroceryItem[] }
  | { type: 'item_toggled'; item: GroceryItem }
  | { type: 'item_deleted'; id: string }
  | { type: 'items_moved'; deletedIds: string[]; pantryItems: PantryItem[] }
  | { type: 'item_updated'; item: GroceryItem }
  | { type: 'pantry_added'; item: PantryItem }
  | { type: 'pantry_updated'; item: PantryItem }
  | { type: 'pantry_deleted'; id: string }
  | { type: 'meal_generated'; meal: GeneratedMeal; imageUrl?: string; recipeId?: string; generatedBySlot: PartnerSlot; generatedByName?: string; generatedByPartnerId?: string; aiMessage?: string; at: number }
  | { type: 'recipe_added'; recipeId: string; recipeName: string; at: number }
  | { type: 'hello'; partnerId: string; slot: PartnerSlot; at: number };

interface GroceryItemRow {
  id: string;
  household_id: string;
  name: string;
  category: string;
  is_checked: number;
  is_food: number;
  brand: string;
  needs_review: number;
  added_by_partner_id: string;
  added_by_partner_slot: number;
  created_at: number;
  updated_at: number;
  [key: string]: string | number;
}

interface PantryItemRow {
  id: string;
  household_id: string;
  name: string;
  quantity: string;
  category: string;
  quantity_value: number | null;
  quantity_unit: string;
  brand: string;
  is_food: number;
  needs_review: number;
  added_by_partner_id: string;
  added_by_partner_slot: number;
  created_at: number;
  [key: string]: string | number | null;
}

function rowToItem(row: GroceryItemRow): GroceryItem {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    category: row.category as Category,
    isChecked: row.is_checked === 1,
    isFood: (row.is_food ?? 1) === 1,
    brand: (row.brand as string) || '',
    needsReview: (row.needs_review ?? 0) === 1,
    addedByPartnerId: row.added_by_partner_id,
    addedByPartnerSlot: row.added_by_partner_slot as PartnerSlot,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPantry(row: PantryItemRow): PantryItem {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    quantity: row.quantity,
    category: (row.category || 'Other') as Category,
    quantityValue: row.quantity_value,
    quantityUnit: row.quantity_unit || '',
    brand: row.brand || '',
    isFood: row.is_food === 1,
    needsReview: (row.needs_review ?? 0) === 1,
    addedByPartnerId: row.added_by_partner_id,
    addedByPartnerSlot: row.added_by_partner_slot as PartnerSlot,
    createdAt: row.created_at,
  };
}

function isCategory(value: string): value is Category {
  return value === 'Produce' || value === 'Meat' || value === 'Dairy' || value === 'Pantry' || value === 'Household' || value === 'Personal Care' || value === 'Other';
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS grocery_items (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    is_checked INTEGER NOT NULL DEFAULT 0,
    is_food INTEGER NOT NULL DEFAULT 1,
    brand TEXT NOT NULL DEFAULT '',
    needs_review INTEGER NOT NULL DEFAULT 0,
    added_by_partner_id TEXT NOT NULL,
    added_by_partner_slot INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_grocery_items_household ON grocery_items(household_id);
  CREATE INDEX IF NOT EXISTS idx_grocery_items_created ON grocery_items(created_at);

  CREATE TABLE IF NOT EXISTS pantry_items (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    name TEXT NOT NULL,
    quantity TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'Pantry',
    quantity_value REAL DEFAULT NULL,
    quantity_unit TEXT DEFAULT '',
    brand TEXT DEFAULT '',
    is_food INTEGER NOT NULL DEFAULT 1,
    needs_review INTEGER NOT NULL DEFAULT 0,
    added_by_partner_id TEXT NOT NULL,
    added_by_partner_slot INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pantry_items_household ON pantry_items(household_id);
  CREATE INDEX IF NOT EXISTS idx_pantry_items_created ON pantry_items(created_at);

  CREATE TABLE IF NOT EXISTS pantry_parse_cache (
    input_hash TEXT PRIMARY KEY,
    raw_input TEXT NOT NULL,
    parsed_json TEXT NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('regex', 'ai')),
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_parse_cache_created ON pantry_parse_cache(created_at);

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    partner_id TEXT NOT NULL,
    slot INTEGER NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (partner_id, endpoint)
  );

  CREATE TABLE IF NOT EXISTS purchase_history (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    name TEXT NOT NULL,
    brand TEXT NOT NULL DEFAULT '',
    quantity_value REAL DEFAULT NULL,
    quantity_unit TEXT DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_purchase_history_household ON purchase_history(household_id);
  CREATE INDEX IF NOT EXISTS idx_purchase_history_name ON purchase_history(name, brand);

  CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    partner_id TEXT,
    partner_slot INTEGER,
    partner_name TEXT,
    action_type TEXT NOT NULL,
    target_kind TEXT NOT NULL,
    target_id TEXT,
    target_name TEXT,
    payload TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_activity_log_household_created ON activity_log(household_id, created_at DESC);
`;

interface ConnectedPartner {
  partnerId: string;
  slot: PartnerSlot;
}

export class HouseholdSync {
  private state: DurableObjectState;
  private env: Env;
  private initialized = false;
  private sockets = new Set<WebSocket>();
  private partnerBySocket = new WeakMap<WebSocket, ConnectedPartner>();
  private pushProvider: PushProvider | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
      this.pushProvider = new WebPushProvider(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    }
  }

  private async ensureSchema(): Promise<void> {
    if (this.initialized) return;
    await this.state.storage.sql.exec(SCHEMA);
    await this.runMigrations();
    this.initialized = true;
  }

  private async runMigrations(): Promise<void> {
    try {
      this.state.storage.sql.exec('ALTER TABLE grocery_items ADD COLUMN is_food INTEGER NOT NULL DEFAULT 1');
    } catch { /* column already exists */ }
    try {
      this.state.storage.sql.exec('ALTER TABLE grocery_items ADD COLUMN brand TEXT NOT NULL DEFAULT \'\'');
    } catch { /* column already exists */ }
    try {
      this.state.storage.sql.exec('ALTER TABLE grocery_items ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0');
    } catch { /* column already exists */ }
    try {
      this.state.storage.sql.exec('ALTER TABLE pantry_items ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0');
    } catch { /* column already exists */ }
  }

  private broadcast(event: SyncEvent, exclude?: WebSocket): void {
    const payload = JSON.stringify(event);
    for (const socket of this.sockets) {
      if (socket === exclude) continue;
      if (socket.readyState !== WebSocket.OPEN) continue;
      try {
        socket.send(payload);
      } catch {
      }
    }

    if (this.pushProvider && event.type !== 'hello') {
      this.tryPushToDisconnected(event);
    }

    if (event.type !== 'hello') {
      this.logActivityFromEvent(event).catch((err) => {
        console.error('activity_log insert failed:', err);
      });
    }
  }

  private async logActivityFromEvent(event: SyncEvent): Promise<void> {
    const entry = this.eventToActivityEntry(event);
    if (!entry) return;
    this.state.storage.sql.exec(
      `INSERT INTO activity_log
        (id, household_id, partner_id, partner_slot, partner_name, action_type, target_kind, target_id, target_name, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      entry.id,
      entry.householdId,
      entry.partnerId,
      entry.partnerSlot,
      entry.partnerName,
      entry.actionType,
      entry.targetKind,
      entry.targetId,
      entry.targetName,
      entry.payload,
      entry.createdAt,
    );
  }

  private eventToActivityEntry(event: SyncEvent): {
    id: string;
    householdId: string;
    partnerId: string | null;
    partnerSlot: number | null;
    partnerName: string | null;
    actionType: string;
    targetKind: string;
    targetId: string | null;
    targetName: string | null;
    payload: string | null;
    createdAt: number;
  } | null {
    const householdId = (this.state.id as { toString(): string }).toString();
    const id = crypto.randomUUID();
    const createdAt = Date.now();

    switch (event.type) {
      case 'item_added':
        return {
          id, householdId, createdAt,
          partnerId: event.item.addedByPartnerId,
          partnerSlot: event.item.addedByPartnerSlot,
          partnerName: null,
          actionType: 'item_added',
          targetKind: 'grocery_item',
          targetId: event.item.id,
          targetName: event.item.name,
          payload: JSON.stringify({ category: event.item.category }),
        };
      case 'items_added':
        return {
          id, householdId, createdAt,
          partnerId: event.items[0]?.addedByPartnerId ?? null,
          partnerSlot: event.items[0]?.addedByPartnerSlot ?? null,
          partnerName: null,
          actionType: 'items_added',
          targetKind: 'grocery_item',
          targetId: null,
          targetName: `${event.items.length} items`,
          payload: JSON.stringify({ names: event.items.map((i) => i.name) }),
        };
      case 'item_toggled':
        return {
          id, householdId, createdAt,
          partnerId: event.item.addedByPartnerId,
          partnerSlot: event.item.addedByPartnerSlot,
          partnerName: null,
          actionType: event.item.isChecked ? 'item_checked' : 'item_unchecked',
          targetKind: 'grocery_item',
          targetId: event.item.id,
          targetName: event.item.name,
          payload: null,
        };
      case 'item_deleted':
        return {
          id, householdId, createdAt,
          partnerId: null,
          partnerSlot: null,
          partnerName: null,
          actionType: 'item_deleted',
          targetKind: 'grocery_item',
          targetId: event.id,
          targetName: null,
          payload: null,
        };
      case 'items_moved':
        return {
          id, householdId, createdAt,
          partnerId: event.pantryItems[0]?.addedByPartnerId ?? null,
          partnerSlot: event.pantryItems[0]?.addedByPartnerSlot ?? null,
          partnerName: null,
          actionType: 'items_moved_to_pantry',
          targetKind: 'grocery_item',
          targetId: null,
          targetName: `${event.deletedIds.length} items`,
          payload: null,
        };
      case 'item_updated':
        return {
          id, householdId, createdAt,
          partnerId: event.item.addedByPartnerId,
          partnerSlot: event.item.addedByPartnerSlot,
          partnerName: null,
          actionType: 'item_updated',
          targetKind: 'grocery_item',
          targetId: event.item.id,
          targetName: event.item.name,
          payload: null,
        };
      case 'pantry_added':
        return {
          id, householdId, createdAt,
          partnerId: event.item.addedByPartnerId,
          partnerSlot: event.item.addedByPartnerSlot,
          partnerName: null,
          actionType: 'pantry_added',
          targetKind: 'pantry_item',
          targetId: event.item.id,
          targetName: event.item.name,
          payload: null,
        };
      case 'pantry_updated':
        return {
          id, householdId, createdAt,
          partnerId: event.item.addedByPartnerId,
          partnerSlot: event.item.addedByPartnerSlot,
          partnerName: null,
          actionType: 'pantry_updated',
          targetKind: 'pantry_item',
          targetId: event.item.id,
          targetName: event.item.name,
          payload: null,
        };
      case 'pantry_deleted':
        return {
          id, householdId, createdAt,
          partnerId: null,
          partnerSlot: null,
          partnerName: null,
          actionType: 'pantry_deleted',
          targetKind: 'pantry_item',
          targetId: event.id,
          targetName: null,
          payload: null,
        };
      case 'meal_generated':
        return {
          id, householdId, createdAt,
          partnerId: event.generatedByPartnerId ?? null,
          partnerSlot: event.generatedBySlot,
          partnerName: event.generatedByName ?? null,
          actionType: 'meal_generated',
          targetKind: 'meal',
          targetId: event.recipeId ?? null,
          targetName: event.meal.name,
          payload: null,
        };
      case 'recipe_added':
        return {
          id, householdId, createdAt,
          partnerId: null,
          partnerSlot: null,
          partnerName: null,
          actionType: 'recipe_saved',
          targetKind: 'recipe',
          targetId: event.recipeId,
          targetName: event.recipeName,
          payload: null,
        };
      default:
        return null;
    }
  }

  private findConnectedSlots(): Set<number> {
    const connected = new Set<number>();
    for (const socket of this.sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        const partner = this.partnerBySocket.get(socket);
        if (partner) connected.add(partner.slot);
      }
    }
    return connected;
  }

  private async tryPushToDisconnected(event: SyncEvent): Promise<void> {
    if (!this.pushProvider) return;

    const connectedSlots = this.findConnectedSlots();
    const pushPayload = this.eventToPushPayload(event);
    if (!pushPayload) return;

    const cursor = this.state.storage.sql.exec<{ partner_id: string; slot: number; endpoint: string; p256dh: string; auth: string }>(
      'SELECT partner_id, slot, endpoint, p256dh, auth FROM push_subscriptions',
    );
    const subs = Array.from(cursor);

    for (const sub of subs) {
      if (connectedSlots.has(sub.slot)) continue;

      try {
        await this.pushProvider.send(
          { partnerId: sub.partner_id, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          pushPayload,
        );
      } catch {
      }
    }
  }

  private eventToPushPayload(event: SyncEvent): PushPayload | null {
    switch (event.type) {
      case 'item_added':
        return { title: 'CookTwo', body: `New item added: ${event.item.name}`, tag: 'cfs-grocery' };
      case 'items_added':
        return { title: 'CookTwo', body: `${event.items.length} item${event.items.length > 1 ? 's' : ''} added to shopping list`, tag: 'cfs-grocery' };
      case 'item_toggled':
        return { title: 'CookTwo', body: `${event.item.name} ${event.item.isChecked ? 'checked off' : 'unchecked'}`, tag: 'cfs-grocery' };
      case 'item_deleted':
        return { title: 'CookTwo', body: 'An item was removed', tag: 'cfs-grocery' };
      case 'items_moved':
        return { title: 'CookTwo', body: `${event.deletedIds.length} item${event.deletedIds.length > 1 ? 's' : ''} moved to pantry`, tag: 'cfs-grocery' };
      case 'item_updated':
        return { title: 'CookTwo', body: `${event.item.name} was updated`, tag: 'cfs-grocery' };
      case 'meal_generated': {
        const who = event.generatedByName ? `${event.generatedByName} ` : '';
        return { title: 'CookTwo', body: `${who}generated a meal: ${event.meal.name}`, tag: 'cfs-meal' };
      }
      case 'recipe_added':
        return { title: 'CookTwo', body: `New recipe saved: ${event.recipeName}`, tag: 'cfs-recipe' };
      default:
        return null;
    }
  }

  private async readPartnerFromQuery(url: URL): Promise<ConnectedPartner> {
    const partnerId = url.searchParams.get('partnerId') ?? `anon-${crypto.randomUUID().slice(0, 6)}`;
    const slotParam = url.searchParams.get('slot');
    const slot: PartnerSlot = slotParam === '2' ? 2 : 1;
    return { partnerId, slot };
  }

  async fetch(request: Request): Promise<Response> {
    await this.state.blockConcurrencyWhile(async () => {
      await this.ensureSchema();
    });

    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket upgrade', { status: 426 });
      }
      const partner = await this.readPartnerFromQuery(url);
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.sockets.add(server);
      this.partnerBySocket.set(server, partner);
      server.accept();
      server.addEventListener('close', () => {
        this.sockets.delete(server);
      });
      server.addEventListener('error', () => {
        this.sockets.delete(server);
      });
      server.send(
        JSON.stringify({ type: 'hello', partnerId: partner.partnerId, slot: partner.slot, at: Date.now() } satisfies SyncEvent),
      );
      return new Response(null, { status: 101, webSocket: client });
    }

    await this.state.blockConcurrencyWhile(async () => {
      await this.ensureSchema();
    });

    const path = url.pathname;
    const method = request.method;

    try {
      if (path === '/items' && method === 'GET') {
        return this.json(await this.getItems());
      }
      if (path === '/items/bulk' && method === 'POST') {
        const body = (await request.json()) as {
          items: string[];
          addedByPartnerId: string;
          addedByPartnerSlot: number;
        };
        const items = await this.addItemsBulk(body);
        this.broadcast({ type: 'items_added', items });
        return this.json(items, 201);
      }
      if (path === '/items' && method === 'POST') {
        const body = (await request.json()) as {
          name: string;
          addedByPartnerId: string;
          addedByPartnerSlot: number;
        };
        const rawName = (body.name ?? '').trim();
        const parts = rawName.split(/[,;]/).map((p: string) => p.trim()).filter((p: string) => p.length > 0);
        if (parts.length > 1) {
          const items = await this.addItemsBulk({ items: parts, addedByPartnerId: body.addedByPartnerId, addedByPartnerSlot: body.addedByPartnerSlot });
          this.broadcast({ type: 'items_added', items });
          return this.json(items, 201);
        }
        const item = await this.addItem(body);
        this.broadcast({ type: 'item_added', item });
        return this.json(item, 201);
      }
      if (path === '/items/move-to-pantry' && method === 'POST') {
        const body = (await request.json()) as {
          addedByPartnerId: string;
          addedByPartnerSlot: number;
        };
        const result = await this.moveCheckedToPantry(body);
        for (const pi of result.pantryItems) {
          this.broadcast({ type: 'pantry_added', item: pi });
        }
        for (const id of result.deletedIds) {
          this.broadcast({ type: 'item_deleted', id });
        }
        this.broadcast({ type: 'items_moved', deletedIds: result.deletedIds, pantryItems: result.pantryItems });
        return this.json(result, 200);
      }
      const toggleMatch = path.match(/^\/items\/([^/]+)\/toggle$/);
      if (toggleMatch && method === 'PATCH') {
        const itemId = toggleMatch[1] as string;
        const item = await this.toggleItem(itemId);
        this.broadcast({ type: 'item_toggled', item });
        return this.json(item);
      }

      // PATCH /items/:id — reclassify a grocery item
      const itemPatchMatch = path.match(/^\/items\/([^/]+)$/);
      if (itemPatchMatch && method === 'PATCH') {
        const itemId = itemPatchMatch[1] as string;
        const body = (await request.json()) as { category?: string; isFood?: boolean; needsReview?: boolean };
        const item = await this.updateGroceryItem(itemId, body);
        this.broadcast({ type: 'item_updated', item });
        return this.json(item);
      }

      const groceryDeleteMatch = path.match(/^\/items\/([^/]+)$/);
      if (groceryDeleteMatch && method === 'DELETE') {
        const itemId = groceryDeleteMatch[1] as string;
        const result = await this.deleteItem(itemId);
        this.broadcast({ type: 'item_deleted', id: result.id });
        return this.json(result);
      }
      if (path === '/regulars' && method === 'GET') {
        return this.json(await this.getRegulars());
      }

      if (path === '/activity' && method === 'GET') {
        const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 1), 200);
        const beforeParam = url.searchParams.get('before');
        const before = beforeParam ? parseInt(beforeParam, 10) : null;
        return this.json(await this.getActivity(limit, before));
      }

      if (path === '/pantry' && method === 'GET') {
        return this.json(await this.getPantryItems());
      }
      if (path === '/pantry' && method === 'POST') {
        const body = (await request.json()) as {
          name: string;
          quantity: string;
          addedByPartnerId: string;
          addedByPartnerSlot: number;
        };
        const item = await this.addPantryItem(body);
        this.broadcast({ type: 'pantry_added', item });
        return this.json(item, 201);
      }
      if (path === '/pantry/bulk' && method === 'POST') {
        const body = (await request.json()) as {
          items: Array<{ name: string; quantity: string }>;
          addedByPartnerId: string;
          addedByPartnerSlot: number;
        };
        const items = await this.addPantryItemsBulk(body);
        for (const item of items) {
          this.broadcast({ type: 'pantry_added', item });
        }
        return this.json(items, 201);
      }

      // PATCH /pantry/:id — reclassify a pantry item
      const pantryPatchMatch = path.match(/^\/pantry\/([^/]+)$/);
      if (pantryPatchMatch && method === 'PATCH') {
        const itemId = pantryPatchMatch[1] as string;
        const body = (await request.json()) as { category?: string; isFood?: boolean; needsReview?: boolean; name?: string };
        const item = await this.updatePantryItem(itemId, body);
        this.broadcast({ type: 'pantry_updated', item });
        return this.json(item);
      }

      const pantryDeleteMatch = path.match(/^\/pantry\/([^/]+)$/);
      if (pantryDeleteMatch && method === 'DELETE') {
        const itemId = pantryDeleteMatch[1] as string;
        const result = await this.deletePantryItem(itemId);
        this.broadcast({ type: 'pantry_deleted', id: result.id });
        return this.json(result);
      }
      if (path === '/pantry/subtract' && method === 'POST') {
        const body = (await request.json()) as {
          usedIngredients: Array<{ name: string; quantityValue: number | null; quantityUnit: string }>;
        };
        const result = await this.subtractPantryForMeal(body.usedIngredients);
        return this.json(result);
      }

      if (path === '/meal-event' && method === 'POST') {
        const body = (await request.json()) as SyncEvent;
        if (body.type !== 'meal_generated' && body.type !== 'recipe_added') {
          return this.json({ error: 'unsupported meal-event type' }, 400);
        }
        this.broadcast(body);
        return this.json({ ok: true });
      }

      if (path === '/push/subscribe' && method === 'POST') {
        const body = (await request.json()) as {
          partnerId: string;
          slot: number;
          endpoint: string;
          keys: { p256dh: string; auth: string };
        };
        if (!body.partnerId || !body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
          return this.json({ error: 'partnerId, slot, endpoint, keys.p256dh, keys.auth required' }, 400);
        }
        await this.savePushSubscription(body.partnerId, body.slot, body.endpoint, body.keys.p256dh, body.keys.auth);
        return this.json({ ok: true });
      }

      if (path === '/push/unsubscribe' && method === 'DELETE') {
        const body = (await request.json()) as { partnerId: string; endpoint?: string };
        if (!body.partnerId) return this.json({ error: 'partnerId required' }, 400);
        await this.removePushSubscription(body.partnerId, body.endpoint);
        return this.json({ ok: true });
      }

      return this.json({ error: 'not_found', path, method }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown_error';
      return this.json({ error: 'bad_request', message }, 400);
    }
  }

  private json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  private parsedToGroceryFields(parsed: ParsedPantryItem): { name: string; category: string; isFood: number; brand: string; needsReview: number } {
    return {
      name: parsed.name,
      category: parsed.category,
      isFood: parsed.isFood ? 1 : 0,
      brand: parsed.brand,
      needsReview: parsed.needsReview ? 1 : 0,
    };
  }

  private async getItems(): Promise<GroceryItem[]> {
    const cursor = this.state.storage.sql.exec<GroceryItemRow>(
      'SELECT * FROM grocery_items ORDER BY created_at ASC',
    );
    const rows = Array.from(cursor);
    return rows.map((row) => rowToItem(row));
  }

  private async getRegulars(): Promise<Array<{ name: string; count: number; brand: string; quantityValue: number | null; quantityUnit: string }>> {
    const cursor = this.state.storage.sql.exec<{ name: string; count: number; brand: string; quantityValue: number | null; quantityUnit: string }>(
      `SELECT name, brand,
              COUNT(*) as count,
              (SELECT quantity_value FROM purchase_history ph2 WHERE ph2.name = ph.name AND ph2.brand = ph.brand ORDER BY ph2.created_at DESC LIMIT 1) as quantityValue,
              (SELECT quantity_unit FROM purchase_history ph3 WHERE ph3.name = ph.name AND ph3.brand = ph.brand ORDER BY ph3.created_at DESC LIMIT 1) as quantityUnit
       FROM purchase_history ph
       GROUP BY name, brand
       HAVING count > 2
       ORDER BY count DESC
       LIMIT 15`,
    );
    return Array.from(cursor);
  }

  private async getActivity(limit: number, before: number | null): Promise<Array<Record<string, unknown>>> {
    const householdId = (this.state.id as { toString(): string }).toString();
    interface ActivityDORow {
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
      [key: string]: string | number | null;
    }
    let cursor;
    if (before !== null) {
      cursor = this.state.storage.sql.exec<ActivityDORow>(
        `SELECT * FROM activity_log WHERE household_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?`,
        householdId, before, limit,
      );
    } else {
      cursor = this.state.storage.sql.exec<ActivityDORow>(
        `SELECT * FROM activity_log WHERE household_id = ? ORDER BY created_at DESC LIMIT ?`,
        householdId, limit,
      );
    }
    const rows = Array.from(cursor);
    return rows.map((row) => ({
      id: row.id,
      householdId: row.household_id,
      partnerId: row.partner_id,
      partnerSlot: (row.partner_slot === 1 || row.partner_slot === 2) ? row.partner_slot : null,
      partnerName: row.partner_name,
      actionType: row.action_type,
      targetKind: row.target_kind,
      targetId: row.target_id,
      targetName: row.target_name,
      payload: row.payload,
      createdAt: row.created_at,
    }));
  }

  private async addItem(body: {
    name: string;
    addedByPartnerId: string;
    addedByPartnerSlot: number;
  }): Promise<GroceryItem> {
    const rawInput = (body.name ?? '').trim();
    if (!rawInput) throw new Error('name is required');
    if (body.addedByPartnerSlot !== 1 && body.addedByPartnerSlot !== 2) {
      throw new Error('addedByPartnerSlot must be 1 or 2');
    }

    const parsed = parsePantryItemSync(rawInput);
    const fields = this.parsedToGroceryFields(parsed);

    const householdId = (this.state.id as { toString(): string }).toString();
    const id = crypto.randomUUID();
    const now = Date.now();

    this.state.storage.sql.exec(
      `INSERT INTO grocery_items
        (id, household_id, name, category, is_checked, is_food, brand, needs_review, added_by_partner_id, added_by_partner_slot, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      householdId,
      fields.name,
      fields.category,
      fields.isFood,
      fields.brand,
      fields.needsReview,
      body.addedByPartnerId,
      body.addedByPartnerSlot,
      now,
      now,
    );

    return {
      id,
      householdId,
      name: fields.name,
      category: fields.category as Category,
      isChecked: false,
      isFood: parsed.isFood,
      brand: fields.brand,
      needsReview: parsed.needsReview,
      addedByPartnerId: body.addedByPartnerId,
      addedByPartnerSlot: body.addedByPartnerSlot as PartnerSlot,
      createdAt: now,
      updatedAt: now,
    };
  }

  private async addItemsBulk(body: {
    items: string[];
    addedByPartnerId: string;
    addedByPartnerSlot: number;
  }): Promise<GroceryItem[]> {
    if (body.addedByPartnerSlot !== 1 && body.addedByPartnerSlot !== 2) {
      throw new Error('addedByPartnerSlot must be 1 or 2');
    }

    const householdId = (this.state.id as { toString(): string }).toString();
    const now = Date.now();
    const results: GroceryItem[] = [];

    for (const rawInput of body.items) {
      const trimmed = (rawInput ?? '').trim();
      if (!trimmed) continue;

      const parsed = parsePantryItemSync(trimmed);
      const fields = this.parsedToGroceryFields(parsed);
      const id = crypto.randomUUID();

      this.state.storage.sql.exec(
        `INSERT INTO grocery_items
          (id, household_id, name, category, is_checked, is_food, brand, needs_review, added_by_partner_id, added_by_partner_slot, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        householdId,
        fields.name,
        fields.category,
        fields.isFood,
        fields.brand,
        fields.needsReview,
        body.addedByPartnerId,
        body.addedByPartnerSlot,
        now,
        now,
      );

      results.push({
        id,
        householdId,
        name: fields.name,
        category: fields.category as Category,
        isChecked: false,
        isFood: parsed.isFood,
        brand: fields.brand,
        needsReview: parsed.needsReview,
        addedByPartnerId: body.addedByPartnerId,
        addedByPartnerSlot: body.addedByPartnerSlot as PartnerSlot,
        createdAt: now,
        updatedAt: now,
      });
    }

    return results;
  }

  private async updateGroceryItem(itemId: string, updates: { category?: string; isFood?: boolean; needsReview?: boolean }): Promise<GroceryItem> {
    const cursor = this.state.storage.sql.exec<GroceryItemRow>(
      'SELECT * FROM grocery_items WHERE id = ?',
      itemId,
    );
    const existing = Array.from(cursor)[0];
    if (!existing) throw new Error('item not found');

    const now = Date.now();
    const newCategory = (updates.category && isCategory(updates.category)) ? updates.category : (existing.category as string);
    const newIsFood = typeof updates.isFood === 'boolean' ? (updates.isFood ? 1 : 0) : existing.is_food;
    const newNeedsReview = typeof updates.needsReview === 'boolean' ? (updates.needsReview ? 1 : 0) : 0;

    this.state.storage.sql.exec(
      'UPDATE grocery_items SET category = ?, is_food = ?, needs_review = ?, updated_at = ? WHERE id = ?',
      newCategory,
      newIsFood,
      newNeedsReview,
      now,
      itemId,
    );

    return rowToItem({ ...existing, category: newCategory, is_food: newIsFood, needs_review: newNeedsReview, updated_at: now });
  }

  private async updatePantryItem(itemId: string, updates: { category?: string; isFood?: boolean; needsReview?: boolean; name?: string }): Promise<PantryItem> {
    const cursor = this.state.storage.sql.exec<PantryItemRow>(
      'SELECT * FROM pantry_items WHERE id = ?',
      itemId,
    );
    const existing = Array.from(cursor)[0];
    if (!existing) throw new Error('item not found');

    const newCategory = (updates.category && isCategory(updates.category)) ? updates.category : (existing.category as string);
    const newIsFood = typeof updates.isFood === 'boolean' ? (updates.isFood ? 1 : 0) : existing.is_food;
    const newNeedsReview = typeof updates.needsReview === 'boolean' ? (updates.needsReview ? 1 : 0) : 0;
    const newName = (updates.name && updates.name.trim()) ? updates.name.trim() : (existing.name as string);

    this.state.storage.sql.exec(
      'UPDATE pantry_items SET category = ?, is_food = ?, needs_review = ?, name = ? WHERE id = ?',
      newCategory,
      newIsFood,
      newNeedsReview,
      newName,
      itemId,
    );

    return rowToPantry({ ...existing, name: newName, category: newCategory, is_food: newIsFood, needs_review: newNeedsReview });
  }

  private async moveCheckedToPantry(body: {
    addedByPartnerId: string;
    addedByPartnerSlot: number;
  }): Promise<{ deletedIds: string[]; pantryItems: PantryItem[] }> {
    const cursor = this.state.storage.sql.exec<GroceryItemRow>(
      'SELECT * FROM grocery_items WHERE is_checked = 1',
    );
    const checkedRows = Array.from(cursor);

    const deletedIds: string[] = [];
    const pantryItems: PantryItem[] = [];
    const now = Date.now();
    const householdId = (this.state.id as { toString(): string }).toString();

    for (const row of checkedRows) {
      const item = rowToItem(row);
      const id = row.id as string;

      if (item.isFood) {
        const parsed = parsePantryItemSync(item.name);
        const purchaseId = crypto.randomUUID();
        this.state.storage.sql.exec(
          `INSERT INTO purchase_history (id, household_id, name, brand, quantity_value, quantity_unit, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          purchaseId,
          householdId,
          parsed.name,
          parsed.brand || item.brand || '',
          parsed.quantityValue,
          parsed.quantityUnit,
          now,
        );
        const pantryId = crypto.randomUUID();
        this.state.storage.sql.exec(
          `INSERT INTO pantry_items
            (id, household_id, name, quantity, category, quantity_value, quantity_unit, brand, is_food, needs_review, added_by_partner_id, added_by_partner_slot, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          pantryId,
          householdId,
          parsed.name,
          parsed.quantityUnit ? `${parsed.quantityValue ?? ''} ${parsed.quantityUnit}`.trim() : '',
          parsed.category,
          parsed.quantityValue,
          parsed.quantityUnit,
          parsed.brand || item.brand,
          1,
          parsed.needsReview ? 1 : 0,
          body.addedByPartnerId,
          body.addedByPartnerSlot,
          now,
        );
        pantryItems.push({
          id: pantryId,
          householdId,
          name: parsed.name,
          quantity: parsed.quantityUnit ? `${parsed.quantityValue ?? ''} ${parsed.quantityUnit}`.trim() : '',
          category: parsed.category,
          quantityValue: parsed.quantityValue,
          quantityUnit: parsed.quantityUnit,
          brand: parsed.brand || item.brand,
          isFood: true,
          needsReview: parsed.needsReview,
          addedByPartnerId: body.addedByPartnerId,
          addedByPartnerSlot: body.addedByPartnerSlot as PartnerSlot,
          createdAt: now,
        });
      }

      this.state.storage.sql.exec('DELETE FROM grocery_items WHERE id = ?', id);
      deletedIds.push(id);
    }

    return { deletedIds, pantryItems };
  }

  private async toggleItem(id: string): Promise<GroceryItem> {
    const cursor = this.state.storage.sql.exec<GroceryItemRow>(
      'SELECT * FROM grocery_items WHERE id = ?',
      id,
    );
    const existing = Array.from(cursor)[0];
    if (!existing) throw new Error('item not found');

    const newIsChecked = existing.is_checked === 1 ? 0 : 1;
    const now = Date.now();
    this.state.storage.sql.exec(
      'UPDATE grocery_items SET is_checked = ?, updated_at = ? WHERE id = ?',
      newIsChecked,
      now,
      id,
    );

    return rowToItem({ ...existing, is_checked: newIsChecked, updated_at: now });
  }

  private async deleteItem(id: string): Promise<{ id: string; deleted: true }> {
    this.state.storage.sql.exec('DELETE FROM grocery_items WHERE id = ?', id);
    return { id, deleted: true };
  }

  private async getPantryItems(): Promise<PantryItem[]> {
    const cursor = this.state.storage.sql.exec<PantryItemRow>(
      'SELECT * FROM pantry_items ORDER BY created_at ASC',
    );
    const rows = Array.from(cursor);
    return rows.map((row) => rowToPantry(row));
  }

  private async addPantryItem(body: {
    name: string;
    quantity: string;
    addedByPartnerId: string;
    addedByPartnerSlot: number;
  }): Promise<PantryItem> {
    const rawInput = (body.name ?? '').trim();
    if (!rawInput) throw new Error('name is required');
    if (body.addedByPartnerSlot !== 1 && body.addedByPartnerSlot !== 2) {
      throw new Error('addedByPartnerSlot must be 1 or 2');
    }

    const parsed = parsePantryItemSync(rawInput);

    const householdId = (this.state.id as { toString(): string }).toString();
    const id = crypto.randomUUID();
    const now = Date.now();

    this.state.storage.sql.exec(
      `INSERT INTO pantry_items
        (id, household_id, name, quantity, category, quantity_value, quantity_unit, brand, is_food, needs_review, added_by_partner_id, added_by_partner_slot, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      householdId,
      parsed.name,
      parsed.quantityUnit ? `${parsed.quantityValue ?? ''} ${parsed.quantityUnit}`.trim() : '',
      parsed.category,
      parsed.quantityValue,
      parsed.quantityUnit,
      parsed.brand,
      parsed.isFood ? 1 : 0,
      parsed.needsReview ? 1 : 0,
      body.addedByPartnerId,
      body.addedByPartnerSlot,
      now,
    );

    return {
      id,
      householdId,
      name: parsed.name,
      quantity: parsed.quantityUnit ? `${parsed.quantityValue ?? ''} ${parsed.quantityUnit}`.trim() : '',
      category: parsed.category,
      quantityValue: parsed.quantityValue,
      quantityUnit: parsed.quantityUnit,
      brand: parsed.brand,
      isFood: parsed.isFood,
      needsReview: parsed.needsReview,
      addedByPartnerId: body.addedByPartnerId,
      addedByPartnerSlot: body.addedByPartnerSlot as PartnerSlot,
      createdAt: now,
    };
  }

  private async addPantryItemsBulk(body: {
    items: Array<{ name: string; quantity: string }>;
    addedByPartnerId: string;
    addedByPartnerSlot: number;
  }): Promise<PantryItem[]> {
    const householdId = (this.state.id as { toString(): string }).toString();
    const now = Date.now();
    const results: PantryItem[] = [];

    for (const item of body.items) {
      const rawInput = (item.name ?? '').trim();
      if (!rawInput) continue;

      const parsed = parsePantryItemSync(rawInput);
      const id = crypto.randomUUID();

      this.state.storage.sql.exec(
        `INSERT INTO pantry_items
          (id, household_id, name, quantity, category, quantity_value, quantity_unit, brand, is_food, needs_review, added_by_partner_id, added_by_partner_slot, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        householdId,
        parsed.name,
        parsed.quantityUnit ? `${parsed.quantityValue ?? ''} ${parsed.quantityUnit}`.trim() : '',
        parsed.category,
        parsed.quantityValue,
        parsed.quantityUnit,
        parsed.brand,
        parsed.isFood ? 1 : 0,
        parsed.needsReview ? 1 : 0,
        body.addedByPartnerId,
        body.addedByPartnerSlot,
        now,
      );

      results.push({
        id,
        householdId,
        name: parsed.name,
        quantity: parsed.quantityUnit ? `${parsed.quantityValue ?? ''} ${parsed.quantityUnit}`.trim() : '',
        category: parsed.category,
        quantityValue: parsed.quantityValue,
        quantityUnit: parsed.quantityUnit,
        brand: parsed.brand,
        isFood: parsed.isFood,
        needsReview: parsed.needsReview,
        addedByPartnerId: body.addedByPartnerId,
        addedByPartnerSlot: body.addedByPartnerSlot as PartnerSlot,
        createdAt: now,
      });
    }

    return results;
  }

  private async deletePantryItem(id: string): Promise<{ id: string; deleted: true }> {
    this.state.storage.sql.exec('DELETE FROM pantry_items WHERE id = ?', id);
    return { id, deleted: true };
  }

  async subtractPantryForMeal(usedIngredients: Array<{ name: string; quantityValue: number | null; quantityUnit: string }>): Promise<{ updated: string[]; removed: string[] }> {
    const updated: string[] = [];
    const removed: string[] = [];

    for (const ingredient of usedIngredients) {
      const ingredientName = ingredient.name.toLowerCase().trim();
      if (!ingredientName) continue;

      const cursor = this.state.storage.sql.exec<PantryItemRow>(
        'SELECT * FROM pantry_items',
      );
      const allItems = Array.from(cursor);

      let matchedItem: PantryItemRow | null = null;
      for (const row of allItems) {
        const pantryName = (row.name as string).toLowerCase();
        if (pantryName.includes(ingredientName) || ingredientName.includes(pantryName)) {
          matchedItem = row;
          break;
        }
      }

      if (!matchedItem) continue;

      const pantryQuantityValue = matchedItem.quantity_value as number | null;
      const pantryQuantityUnit = (matchedItem.quantity_unit as string) || '';

      if (pantryQuantityValue === null || pantryQuantityValue === undefined) {
        this.state.storage.sql.exec('DELETE FROM pantry_items WHERE id = ?', matchedItem.id);
        removed.push(matchedItem.name as string);
        this.broadcast({ type: 'pantry_deleted', id: matchedItem.id as string });
        continue;
      }

      if (ingredient.quantityUnit && pantryQuantityUnit && ingredient.quantityUnit.toLowerCase() !== pantryQuantityUnit.toLowerCase()) {
        this.state.storage.sql.exec('DELETE FROM pantry_items WHERE id = ?', matchedItem.id);
        removed.push(matchedItem.name as string);
        this.broadcast({ type: 'pantry_deleted', id: matchedItem.id as string });
        continue;
      }

      const newQuantity = pantryQuantityValue - (ingredient.quantityValue ?? 0);

      if (newQuantity <= 0) {
        this.state.storage.sql.exec('DELETE FROM pantry_items WHERE id = ?', matchedItem.id);
        removed.push(matchedItem.name as string);
        this.broadcast({ type: 'pantry_deleted', id: matchedItem.id as string });
      } else {
        this.state.storage.sql.exec(
          'UPDATE pantry_items SET quantity_value = ?, quantity = ? WHERE id = ?',
          newQuantity,
          `${newQuantity} ${pantryQuantityUnit}`.trim(),
          matchedItem.id,
        );
        updated.push(matchedItem.name as string);
      }
    }

    return { updated, removed };
  }

  private async savePushSubscription(partnerId: string, slot: number, endpoint: string, p256dh: string, auth: string): Promise<void> {
    const now = Date.now();
    this.state.storage.sql.exec(
      `INSERT OR REPLACE INTO push_subscriptions (partner_id, slot, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      partnerId, slot, endpoint, p256dh, auth, now,
    );
  }

  private async removePushSubscription(partnerId: string, endpoint?: string): Promise<void> {
    if (endpoint) {
      this.state.storage.sql.exec(
        'DELETE FROM push_subscriptions WHERE partner_id = ? AND endpoint = ?',
        partnerId, endpoint,
      );
    } else {
      this.state.storage.sql.exec(
        'DELETE FROM push_subscriptions WHERE partner_id = ?',
        partnerId,
      );
    }
  }
}

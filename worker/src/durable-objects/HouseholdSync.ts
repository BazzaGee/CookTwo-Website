import type { Env } from '../env';
import { parsePantryItemSync, type ParsedPantryItem } from '../lib/pantry-parser';

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
    category TEXT NOT NULL DEFAULT 'Other',
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

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
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

  private async getRegulars(): Promise<Array<{ name: string; count: number }>> {
    const cursor = this.state.storage.sql.exec<{ name: string; count: number }>(
      'SELECT name, COUNT(*) as count FROM grocery_items GROUP BY name HAVING count > 1 ORDER BY count DESC LIMIT 15',
    );
    return Array.from(cursor);
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
}

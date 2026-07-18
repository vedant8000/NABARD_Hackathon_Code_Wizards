/** Dexie (IndexedDB) schema — offline-first storage.
 * ledgerQueue: entries awaiting sync (client_uuid PK, server dedupes)
 * apiCache:    mirror of GET responses for offline rendering
 */
import Dexie, { type Table } from "dexie";

export interface QueuedEntry {
  client_uuid: string;
  date: string;
  kind: "income" | "expense" | "savings_deposit" | "loan_repayment";
  amount: number;
  category: string;
  note: string;
  queued_at: number;
}

export interface CacheRow {
  path: string;
  data: unknown;
  saved_at: number;
}

class MiraDB extends Dexie {
  ledgerQueue!: Table<QueuedEntry, string>;
  apiCache!: Table<CacheRow, string>;

  constructor() {
    super("mira");
    this.version(1).stores({
      ledgerQueue: "client_uuid, queued_at",
      apiCache: "path, saved_at",
    });
  }
}

export const db = new MiraDB();

export async function cachePut(path: string, data: unknown): Promise<void> {
  try {
    await db.apiCache.put({ path, data, saved_at: Date.now() });
  } catch { /* private mode etc. — cache is best-effort */ }
}

export async function cacheGet(path: string): Promise<unknown | undefined> {
  try {
    const row = await db.apiCache.get(path);
    return row?.data;
  } catch {
    return undefined;
  }
}

export async function cacheAge(path: string): Promise<number | null> {
  try {
    const row = await db.apiCache.get(path);
    return row ? Date.now() - row.saved_at : null;
  } catch {
    return null;
  }
}

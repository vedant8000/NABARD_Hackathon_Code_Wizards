/** Write path: ledger entries ALWAYS land in IndexedDB first, then the
 * sync worker flushes them to POST /api/me/ledger/batch when online.
 * The server dedupes on client_uuid, so replays are safe. */
import { apiPost } from "../api/client";
import { useStore } from "../state/store";
import { db, type QueuedEntry } from "./db";

export async function enqueueEntry(e: Omit<QueuedEntry, "client_uuid" | "queued_at">): Promise<QueuedEntry> {
  const entry: QueuedEntry = {
    ...e,
    client_uuid: crypto.randomUUID(),
    queued_at: Date.now(),
  };
  await db.ledgerQueue.put(entry);
  void flushQueue();
  return entry;
}

let flushing = false;

export async function flushQueue(): Promise<number> {
  if (flushing || !navigator.onLine || !useStore.getState().token) return 0;
  flushing = true;
  try {
    const pending = await db.ledgerQueue.orderBy("queued_at").toArray();
    if (!pending.length) return 0;
    const res = await apiPost("/api/me/ledger/batch", {
      entries: pending.map(({ queued_at, ...e }) => e),
    });
    await db.ledgerQueue.bulkDelete(pending.map((e) => e.client_uuid));
    return res.synced ?? pending.length;
  } catch {
    return 0; // stay queued; retry on next online event
  } finally {
    flushing = false;
  }
}

export async function pendingCount(): Promise<number> {
  try {
    return await db.ledgerQueue.count();
  } catch {
    return 0;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flushQueue());
  // belt-and-braces periodic flush
  setInterval(() => void flushQueue(), 30_000);
}

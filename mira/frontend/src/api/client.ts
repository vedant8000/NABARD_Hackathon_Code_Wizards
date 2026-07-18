/** Typed fetch client. GETs are cached into IndexedDB by the offline layer
 * (src/offline) so screens can render stale data when the network is gone. */
import { useStore } from "../state/store";
import { cacheGet, cachePut } from "../offline/db";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function headers(): Record<string, string> {
  const t = useStore.getState().token;
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

async function handle(r: Response) {
  if (r.status === 401) {
    useStore.getState().logout();
    throw new ApiError(401, "Session expired — please log in again");
  }
  if (!r.ok) {
    let detail = r.statusText;
    try {
      const j = await r.json();
      detail = j.detail ?? detail;
    } catch { /* not json */ }
    throw new ApiError(r.status, String(detail));
  }
  return r.json();
}

/** GET with offline fallback: network-first, cache in IndexedDB. */
export async function apiGet<T = any>(path: string): Promise<T> {
  try {
    const r = await fetch(path, { headers: headers() });
    const data = await handle(r);
    void cachePut(path, data);
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const cached = await cacheGet(path);
    if (cached !== undefined) return cached as T;
    throw e;
  }
}

export async function apiPost<T = any>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: "POST", headers: headers(), body: JSON.stringify(body),
  });
  return handle(r) as Promise<T>;
}

/** POST /api/chat and stream SSE deltas via callback. */
export async function apiChatStream(
  body: unknown,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const r = await fetch("/api/chat", {
    method: "POST", headers: headers(), body: JSON.stringify(body), signal,
  });
  if (!r.ok || !r.body) {
    const j = await r.json().catch(() => ({}));
    throw new ApiError(r.status, j.detail ?? "Chat unavailable");
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const j = JSON.parse(line.slice(6));
        if (j.delta) onDelta(j.delta);
      } catch { /* partial */ }
    }
  }
}

# MIRA — Phase Prompt: MongoDB Login → WebSocket Chat → SMS Notifications

Feed this file back to Claude Code (as-is, or per-phase) to execute the work. Each phase has a
**verification gate** — do not start the next phase until the previous one is confirmed working
by the user.

## Current architecture (read this before touching anything)

- Backend: FastAPI (`mira/backend/app`), SQLAlchemy + SQLite (`app/db.py`, `app/models.py`).
- Auth today: `User` table in SQLite. Passwords hashed with PBKDF2-HMAC-SHA256 + per-user random
  salt (`app/deps.py: hash_password/verify_password`). JWT issued via `python-jose`
  (`app/deps.py: create_token`, `get_current_user`). Login endpoint: `app/routers/auth.py`.
- Chat/messages today: polling REST at `/api/messages` (`app/routers/messages.py`), backed by
  `DirectMessage` rows in SQLite, one thread per `enterprise_id`. Frontend polls via
  `ChatThread.tsx` / `pages/udyami/Messages.tsx`.
- Frontend: Vite + React (`mira/frontend`), Zustand store `src/state/store.ts` holds
  `token/role/enterpriseId/displayName`, persisted to localStorage. API client `src/api/client.ts`
  (`apiGet`/`apiPost`, adds `Authorization: Bearer <token>`).
- Deployment: **Vercel**. Backend runs as a Python serverless function (`api/index.py`,
  `vercel.json`, `maxDuration: 60`). In that mode SQLite is written to `/tmp` — **ephemeral,
  wiped on every cold start**. Frontend is served as static `dist/` from the same Vercel project.
- `requirements.txt` already lists `passlib==1.7.4` (currently unused) — use it for the new
  password hashing rather than adding a new dependency.

## Decisions already made (do not re-ask)

1. **MongoDB**: use **MongoDB Atlas** (free-tier cluster). Connection string goes in
   `mira/backend/.env` as `MONGODB_URI` (mongodb+srv://...). User will create the Atlas cluster
   and provide the URI + DB name before Phase 1 starts.
2. **Realtime chat**: implement **real FastAPI WebSockets** (`app/routers/ws_chat.py` or similar),
   not a polling shim and not a third-party pub/sub service. Because Vercel serverless functions
   cannot hold long-lived WebSocket connections, **the backend must move to a persistently-running
   host** (Render, Railway, or Fly.io — user will pick and provision one before Phase 2 starts).
   The frontend (static build) can stay on Vercel; only the API/WS origin changes. This means the
   frontend's API base URL needs to become configurable (env-driven) instead of relying on the
   `/api` same-origin Vercel rewrite.
3. **SMS provider**: **MSG91** (India-focused, DLT-compliant, realistic for rural Indian phone
   numbers). API key + sender ID + DLT template ID will be provided by the user before Phase 3.
4. **Mongo migration scope**: **both** the `users` collection (auth) **and** chat/direct messages
   move to MongoDB. Reasoning: SQLite on Vercel `/tmp` is ephemeral anyway, and Phase 2's
   WebSocket chat needs message history to actually persist in production — no point building it
   twice. `LedgerEntry`, `Alert`, `Intervention`, `ChatMessage` (AI assistant history) stay in
   SQLite for now — out of scope for all three phases below.

---

## Phase 1 — MongoDB-backed login with salted+hashed passwords

**Goal:** replace the SQLite `User` table with a MongoDB `users` collection, keeping the existing
JWT/role-guard flow (`get_current_user`, `require_role`) working unchanged from the frontend's
perspective — no frontend changes should be needed beyond pointing at the same `/api/auth/*`
routes.

Steps:

1. Add `pymongo` (or `motor` if you decide async fits better — FastAPI routes here are currently
   sync/SQLAlchemy-style, so a sync `pymongo` client is the lower-risk choice; use a small
   module-level client, not a new connection per request) to `requirements.txt`.
2. Add `MONGODB_URI` and `MONGODB_DB_NAME` to `app/config.py` (`Settings`), read from `.env`
   (already gitignored — do not commit real credentials).
3. Design the `users` collection schema: `username` (unique index), `password_hash`, `role`
   (`officer`|`enterprise`), `enterprise_id`, `display_name`, `created_at`. Mirror the current
   `User` SQLAlchemy model's fields so downstream code (`create_token`, `require_role`, etc.)
   doesn't need to change its interface — consider a thin dataclass/Pydantic model so callers
   keep using `user.role`, `user.id`, etc. rather than raw dict access everywhere.
4. Replace password hashing: use `passlib.hash.bcrypt` (bcrypt salts automatically per-hash,
   no manual salt handling needed) instead of the hand-rolled PBKDF2 in `app/deps.py`. Keep the
   function names (`hash_password`, `verify_password`) so `app/routers/auth.py` doesn't need
   changes to its calling convention.
5. Rewrite `app/db.py` (or add `app/mongo.py`) to expose a Mongo client/collection accessor,
   analogous to today's `get_db()` SQLAlchemy session dependency.
6. Update `app/routers/auth.py` and any other place that does `db.scalar(select(User)...)` to use
   the Mongo accessor instead.
7. Write a one-off seed script (mirrors `seed_db()` in `app/main.py`) that seeds the same demo
   users (`officer1` + `udyami{enterprise_id}` for each enterprise from `store.enterprises()`,
   password `mira2026`) into Mongo instead of SQLite, so the existing demo/login flow keeps
   working. Remove or gate the old SQLite `seed_db()` `User`-seeding logic (leave `Alert` seeding
   in SQLite untouched — out of scope).
8. Update `me.py` and any other router that reads `User` from SQLAlchemy to read from Mongo
   instead — grep for `from ..models import User` / `select(User)` before starting so nothing is
   missed.

**Verification gate (must pass before Phase 2):**
- `npm run dev` (frontend) + backend running locally against the real Atlas cluster.
- Login as `officer1` / `mira2026` and as an `udyamiN` demo user both succeed, JWT issued, role
  guard on officer-only endpoints (e.g. `/api/admin/rescore`) still 403s the wrong role.
- Confirm in Atlas that the `users` collection is populated and passwords are bcrypt hashes, not
  plaintext or reversible.
- Existing SQLite-backed features (ledger, alerts, reports) still work — nothing else broke.

---

## Phase 2 — WebSocket chat between Field Officer and SHGs

**Goal:** replace the polling `/api/messages` flow with a real-time WebSocket channel, backed by
the MongoDB `direct_messages` collection, while the backend runs on a persistent host (not Vercel
serverless).

Steps:

1. Migrate `DirectMessage` (currently SQLite, see `app/models.py`) to a MongoDB
   `direct_messages` collection with the same fields (`enterprise_id`, `sender_role`,
   `sender_name`, `content`, `read_by_officer`, `read_by_enterprise`, `created_at`).
2. Port the existing REST semantics from `app/routers/messages.py` (`/threads`, `/unread`,
   `/{enterprise_id}` GET/POST, the 10-messages/day guardrail for enterprise senders, the
   read-receipt marking) onto Mongo queries. Keep the REST endpoints working — WebSockets are for
   push/live-delivery, REST stays for initial thread load, history, and officer inbox listing.
3. Add a WebSocket endpoint, e.g. `ws://.../api/ws/messages/{enterprise_id}`, authenticated via
   the same JWT (pass as a query param or the `Sec-WebSocket-Protocol` header — browsers can't set
   custom WS headers, so query param is simplest, matching this project's prototype-pragmatic
   style). Enforce the same `_guard_thread` rule (enterprise users can only open their own thread).
4. Implement a connection manager keyed by `enterprise_id` (a dict of active WebSocket connections
   per thread is enough for this scale) so a message sent by either side is pushed live to any
   other connected participant on that thread, and persisted to Mongo.
5. Update the frontend: `ChatThread.tsx` should open a WebSocket on mount (via a small hook, e.g.
   `useDirectMessageSocket`) instead of / in addition to polling, append incoming messages live,
   and fall back gracefully (existing REST polling or a "reconnecting..." state) if the socket
   drops — this app is explicitly built to tolerate rural connectivity, so do not regress the
   offline-tolerant behavior described in `messages.py`'s own docstring.
6. Make the frontend's API/WS base URL configurable via a Vite env var (e.g.
   `VITE_API_BASE_URL`, `VITE_WS_BASE_URL`) instead of assuming same-origin `/api`, since the
   backend will no longer be same-origin with the Vercel-hosted frontend. Update
   `vite.config.ts`'s dev proxy comment/config accordingly and document the required env vars.
7. Deploy the backend to the persistent host the user provisions (Render/Railway/Fly.io) with
   `MONGODB_URI`, `GEMINI_API_KEY(S)`, `JWT_SECRET` etc. set as that platform's env vars — do not
   put real secrets in any committed file. Update `vercel.json` rewrites if the frontend now needs
   to hit an external API origin rather than a Vercel serverless function.

**Verification gate (must pass before Phase 3):**
- Two browser sessions (one logged in as `officer1`, one as an `udyamiN` enterprise user) can
  exchange messages and see them appear live without refreshing.
- Reconnect behavior works after killing/restoring network (dev tools offline toggle).
- The daily 10-message cap for enterprise senders still enforces correctly through the new path.
- Existing REST endpoints (`/threads`, `/unread`) still return correct data sourced from Mongo.

---

## Phase 3 — SMS notification to SHG on new officer message

**Goal:** when a Field Officer sends a message to an enterprise/SHG thread, trigger an SMS to that
SHG's registered phone number via MSG91.

Steps:

1. Add a `phone_number` field to the Mongo `users` collection (enterprise-role users) — there is
   currently no phone number stored anywhere in the app (only in the generated CSV enterprise
   data, if at all — check `store.enterprises()` columns first). Backfill it into the seed script
   from Phase 1, or add an admin/officer-editable field if no source data has it — confirm with
   the user which source of truth to use before inventing fake numbers.
2. Add MSG91 credentials (`MSG91_AUTH_KEY`, `MSG91_SENDER_ID`, `MSG91_DLT_TEMPLATE_ID`) to
   `app/config.py` / `.env`.
3. Add a small `app/services/sms.py` with a `send_sms(to: str, message: str)` wrapping MSG91's
   HTTP API (use `requests`, already a dependency — no new SDK needed unless MSG91's official
   Python SDK is clearly preferable).
4. Hook the SMS send into the message-send path: in the WebSocket send handler (and/or the
   REST `POST /{enterprise_id}` fallback path) from Phase 2, when `sender_role == "officer"`,
   look up the enterprise user's `phone_number` and fire the SMS. Keep this **fire-and-forget /
   best-effort** — an SMS failure must never block or fail the chat message send itself (log and
   continue).
5. Respect MSG91's DLT template constraints — the SMS body will likely need to match a
   pre-registered template rather than freeform officer text; confirm the approved template
   wording with the user rather than assuming freeform content is deliverable.
6. Add basic rate/opt-out consideration: don't SMS on every single message if an officer sends a
   burst — debounce so a SHG doesn't get spammed (e.g. at most one SMS per thread per N minutes,
   with content like "You have a new message from your officer, open MIRA to read it").

**Verification gate:**
- Sending a message as `officer1` to a real (user-provided, verified) test phone number results
  in an actual SMS delivery within a reasonable time.
- Burst-sending multiple messages does not trigger multiple SMS beyond the debounce policy.
- SMS failures (bad number, MSG91 outage) are logged but do not break the chat send flow.

---

## Things to double check per phase, not assume

- Grep for all current usages of `User`/`DirectMessage` SQLAlchemy models before migrating —
  `app/store.py`, `app/routers/me.py`, `app/routers/portfolio.py`, `app/routers/reports.py`,
  `app/main.py` (`seed_db`) may all touch these.
- Don't silently drop the existing 10-messages/day guardrail or the read-receipt logic when
  porting `messages.py` to Mongo/WebSockets — re-read `app/routers/messages.py` in full first.
- Don't commit real Atlas/MSG91 credentials — `.env` is already gitignored; keep it that way.
- Ask before inventing SHG phone numbers or SMS template wording — use real/user-provided data.

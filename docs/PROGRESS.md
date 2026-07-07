# PROGRESS

Build log. One entry per milestone: what was built, decisions, deviations.

---

## M0 — Foundations (2026-07-05)

**Built**

- npm-workspaces monorepo: `shared/` (envelope + health types, consumed by server via
  TS project references), `server/`, `client/` (bare Vite React placeholder).
- Express app with the exact §4.2 middleware chain: helmet → cors(allowlist from
  `CLIENT_ORIGIN`) → request-id (stdlib `crypto.randomUUID`, echoed as `X-Request-Id`) →
  pino-http → global rate limiter (300/15 min, §4.3; per-route tiers with their
  endpoints) → cookie-parser → json 100kb → routes → notFound → errorHandler.
- `AppError(code, status, message, details?)` + single global error middleware emitting
  the §2.8 envelope; unknown errors masked as 500 INTERNAL in prod.
- Zod-validated env config (`server/src/core/config.ts`) per `.env.example`; only
  M0 keys required, later-milestone keys optional until their milestone.
- `GET /api/v1/health`: live `admin.ping` → 200 `db:"up"` / 503 `db:"down"`, uptime,
  version. pino JSON logging with PII redaction (authorization, cookie, email, password).
- docker-compose (mongo:7 + mailhog), multi-stage non-root Dockerfile, GitHub Actions
  CI (lint → typecheck → test → build), render.yaml (Docker API + static SPA),
  ESLint 9 + Prettier, Vitest.

**Tests** (5 passing): error middleware (AppError envelope, masked 500, 404 envelope),
health endpoint against mongodb-memory-server (503 before connect, 200 + db up after).
Also smoke-booted the compiled `dist` against a real mongod: health, 404 envelope,
security headers, graceful SIGTERM all verified.

**Decisions / deviations from blueprint**

1. **ESLint base**: blueprint Appendix says "airbnb-ts" — airbnb config has no
   maintained ESLint 9 flat-config release, so using `typescript-eslint` recommended +
   `no-explicit-any: error` (same intent, maintained).
2. **Express 5** (not 4): async errors auto-forward to the error middleware — removes
   an entire class of asyncHandler-wrapper boilerplate for all future controllers.
3. **No dotenv dependency**: dev script uses Node's `--env-file=.env`.
4. **compose mongo is standalone** — M3's booking transactions require a replica set;
   single-node `--replSet` will be added in M3 (tests already use
   mongodb-memory-server which handles this).
5. Client is a placeholder only; Tailwind/Router/TanStack Query arrive with the first
   UI milestone (M5) so versions are chosen when actually used.

**DoD check**: all root scripts green locally (lint, typecheck, test, build).
`docker compose up` verified on the dev machine (snap Docker; needs `sudo` until the
docker-group login refresh): mongo + mailhog up, health endpoint returns `db:"up"`.
GitHub Actions CI green on push to main. **Render deploy deferred**: Render signup
requires a card. Revisit at M8 — no-card fallback: Cloudflare/GitHub Pages (client),
Atlas M0 (db), HF Spaces or similar (API). render.yaml stays as the deploy-as-code spec.

---

## M1 — Auth (2026-07-05)

**Built**

- `/api/v1/auth`: register, verify-email (auto-login per §6.3), login, refresh,
  logout, forgot-password, reset-password, resend-verification. Layered per §2.3:
  routes → controller (cookies/status only) → service → models.
- Shared Zod schemas in `shared/src/auth.ts` + `validate(schema)` middleware —
  single validation source for API now and React forms at M5. `UserDto` mapper;
  `passwordHash` is `select:false` and never serialized.
- Sessions (§2.7): 15-min JWT access token + 7-day refresh token in an httpOnly
  SameSite=Lax cookie path-scoped to `/api/v1/auth`. Refresh tokens stored as
  HMAC-SHA256 (keyed by REFRESH_SECRET), one-time-use rotation enforced by atomic
  findOneAndUpdate; **reuse of a revoked token revokes the whole session family**.
  Refresh endpoint also checks Origin against the CORS allowlist. TTL index purges
  expired sessions.
- Security (§8): bcrypt cost 12, lockout 5 fails → 15 min (423), identical 401 for
  unknown-email vs wrong-password incl. dummy-hash compare (timing), uniform 200 on
  forgot-password, emailed tokens stored hashed (verify 24 h, reset 30 min,
  single-use), reset revokes all sessions + confirmation email, auth rate tier
  5/15 min keyed IP+email.
- Notifications outbox (§2.10): `notifications` collection + in-process worker
  (10 s poll, 3 retries 30s/2m/10m, then `failed`), nodemailer → SMTP_URL
  (mailhog dev). Plain-text templates: verify_email, password_reset, password_changed.

**Tests** (20 passing, 15 new): every endpoint's happy + error paths — 409/422 on
register, single-use verify token, 403 EMAIL_UNVERIFIED, enumeration-identical 401s,
lockout 423, **refresh rotation + reuse-detection family revocation (the M1 DoD
gate)**, logout, full reset flow, outbox delivery. Also verified live end-to-end
against dev server + MailHog.

**Decisions / deviations**

1. `bcryptjs` over native bcrypt — same algorithm/cost 12, no alpine build
   toolchain in Docker; cost 4 in tests only (suite speed).
2. Added `POST /auth/resend-verification` — §6.3's resend UI needs it but the
   §4.4 endpoint table omits it (blueprint gap, flagged).
3. migrate-mongo still deferred with the deploy (M8); indexes via mongoose
   autoIndex. Verify/reset token hashes live on the user doc (additive fields —
   §5.2 doesn't specify storage).
4. Outbox writes are not transactional with user writes — local standalone mongo
   has no replica set until M3; acceptable for emails (at-least-once still holds).
5. zod pinned to ^3.25 in both shared and server (v4 crept into shared via a
   bare install and broke cross-package types — lockfile now reconciled).

---

## M2 — Venue & court domain (2026-07-06)

**Built**

- `/api/v1/venues` (§4.4): create (draft) / PATCH / publish / public list / slug
  detail, courts CRUD nested under the venue, Cloudinary signed-upload endpoint.
- `/api/v1/admin` (M2 slice): venue review queue, approve/reject with reason —
  every action writes an append-only `audit_logs` entry and queues an owner email
  (venue_approved / venue_rejected templates).
- Status machine per §5.2: draft → pending_review → approved | rejected;
  rejected venues can be fixed and republished; material edits (name,
  description, area, geo, amenities, photos) on an approved venue re-enter
  review — payAtVenue toggle does not.
- Visibility per §7.5: drafts/pending only for owner + admin (404 to everyone
  else — existence not confirmed); public search shows approved only.
- Search: area (prefix, case-insensitive), amenities ($all), priceMax (via court
  basePrice, two indexed queries — no $lookup), `_id`-cursor pagination.
- Shared Zod schemas (§5.2 validation): 7-day schedule in minutes-from-midnight
  NPT, openMin<closeMin, price 100–100 000 NPR, overrides inside open hours
  (service-level — needs the schedule), ≤5 photos.
- Middleware: `optionalAuth`, `requireRole`; ZodError branch in the global error
  handler (controllers can parse query strings with shared schemas).
- Cloudinary signing via stdlib sha1 — no SDK dependency; browser uploads
  directly, backend never proxies bytes (§2.6). 501 NOT_CONFIGURED until env set.

**Tests** (34 passing, 14 new): ownership/cross-tenant 404s, visibility,
schedule/price/override 422s, publish gate, full approve + reject flows with
audit + email assertions, material-edit re-review, search filters + cursor,
signature correctness.

**Decisions / deviations**

1. First venue creation auto-upgrades player→owner — blueprint never specifies
   how owners are born; self-service beats admin dependency.
2. "Material edit" defined as name/description/area/geo/amenities/photos.
3. Publish requires ≥1 active court (blueprint implies via §6.4 wizard order).
4. Courts DELETE lacks the HAS_FUTURE_BOOKINGS 409 guard until M3 creates the
   bookings collection (flagged in code).
5. Search's "free at date/time" filter deferred to M3 (needs the availability
   engine).

---

## M3 — Booking engine (2026-07-06)

**Built**

- **The sacred index** (§5.2): unique partial on (courtId, date, startMin) where
  status ∈ {pending_payment, confirmed}. Cancelled/expired bookings fall out →
  slots reopen with zero extra logic. §7.3 honored: no locks, no check-then-insert
  — E11000 maps to 409 SLOT_TAKEN with same-day alternatives.
- `GET /courts/:id/availability` (§4.4): schedule − bookings − blocks, 3 indexed
  queries + in-memory assembly (§9), ≤14-day window, `Cache-Control: no-store`
  (§2.5: availability never cached). Slot states: available/taken/blocked/past
  with §7.2-resolved prices.
- `POST /bookings`: §7.1 gates (30-min lead time, 14-day window, schedule-grid
  alignment, block overlap, max 3 pending holds → 429 TOO_MANY_HOLDS), price
  snapshot (§7.2: dayOfWeek override → generic override → basePrice), 10-min
  hold with expiresAt, idempotencyKey (§4.5: repeat POST returns the original),
  10/hour rate tier keyed by userId (§4.3).
- Cancel (§7.4): 100/50/0% refund tiers, 409 TOO_LATE_TO_CANCEL after slot start,
  slot reopens instantly, both sides emailed (booking_cancelled /
  booking_cancelled_owner); refund settlement manual per §6.2.
- Walk-ins: same atomic path, instantly confirmed, channel walk_in, can lose
  the race like anyone (§3.4). Blocks: 409 HAS_BOOKINGS with conflict list —
  never silently kills a booking (§6.4); pending holds count as conflicts too.
- `GET /me/bookings`: status filter + cursor pagination, court/venue names populated.
- Expiry sweeper (§2.10): node-cron */5min + boot sweep — stale 10-min holds →
  `expired`, slot freed, hold_expired email queued.
- Shared `npt.ts`: the formatNPT util + UTC+5:45 offset math (nowNPT, addDays,
  dayOfWeek, slotStartUtc) — unit-tested including the 18:15 UTC = midnight NPT edge.
- k6 race script (`scripts/race-test/`): seed 100 users + `race.k6.js` with
  count==1 threshold — the §11.5 release gate for a real deployment.

**Tests** (59 passing, 25 new): unit (pricing precedence, refund tiers incl.
boundary hours, NPT offset math) + integration (availability shape/prices,
hold creation, SLOT_TAKEN + alternatives, all SLOT_INVALID variants, blocked
slots, idempotency, holds cap, **40-concurrent race → exactly one 201**,
cancel/refund/reopen, TOO_LATE, cross-tenant 404s, venue-owner read access,
sweeper, walk-in races, block conflicts, my-bookings pagination).

**Bugs the suite caught before shipping**

- Compound *sparse* index on (userId, idempotencyKey) indexed key-less bookings
  as (userId, null) — second booking by any user exploded. Fixed with
  partialFilterExpression{idempotencyKey:$exists}.
- Express 5 leaves req.body undefined on body-less POSTs → validate() now
  defaults to {}.

**Decisions / deviations**

1. No MongoDB transactions in M3 — §7.3 itself makes the unique index the final
   arbiter and no multi-document invariant exists yet (notification loss ≠ data
   loss). Replica set + transactions arrive in M4 where payment+booking updates
   are genuinely multi-document.
2. Blocks treat pending_payment holds as conflicts (stricter than §6.4's
   "confirmed" — a paid-in-progress hold shouldn't be silently blocked over).
3. Walk-ins get no confirmation email (no account/address to send to).
4. In-suite race test is 40 VUs (vitest/supertest overhead); the full 100-VU k6
   script ships in scripts/race-test/ for the M8 release checklist.

**Post-milestone regression note (2026-07-07):** full live sweep passed (28
checks: gates, CI, all M1–M3 flows, live cron sweeper). One live fix: the dev
DB still carried the pre-fix *sparse* idempotency index — mongoose autoIndex
can't replace same-name/different-options indexes — dropped and recreated with
the partial filter via mongosh. This is precisely why §5.3 wants migrations;
reaffirms the migrate-mongo item for M8 (any pre-existing prod DB would need
the same manual step).

---

## M4 — Payments (2026-07-07)

**Built**

- payments module (§5.2): one payment doc per booking (unique), providerTxnId
  unique-sparse (replay-proof, §8), raw gateway payloads kept for audit.
- `POST /payments/initiate` (§4.4): eSewa v2 signed form fields (stdlib
  HMAC-SHA256, no SDK, sandbox rc-epay + public UAT secret as defaults),
  Khalti ePayment initiate via fetch (501 until KHALTI_SECRET set), pay-at-venue
  → instant confirm with unpaid note when venue.payAtVenue (§6.1 H2).
  Re-initiation switches provider in place; paid/expired holds → 409.
- `POST /payments/callback/:provider` — §8 order: verify (eSewa: HMAC over
  signed_field_names with timingSafeEqual; Khalti: server-side lookup by a pidx
  WE initiated) → replay check → amount re-derived from OUR booking snapshot →
  status-guarded confirm. Idempotent 200 on replays. §6.5 late webhook: payment
  recorded verified + loud log, expired booking never force-confirmed (slot may
  be rebooked).
- `GET /payments/:id` polling for the checkout page; booking-owner only.
- booking_confirmed / booking_confirmed_owner email templates via the outbox.

**Tests** (71 passing, 12 new): the three DoD gates — sandbox happy, replay,
amount-tamper — plus forged-signature 400, late-webhook handling, provider
switch, venue-pay rules (allowed/refused), Khalti paisa conversion + unknown
pidx 404, polling authz. Also verified live end-to-end against the dev stack:
real hold → initiate → tampered callback rejected (AMOUNT_MISMATCH) → genuine
signed callback confirmed the booking → replay idempotent → both emails in
MailHog.

**Bug found by the live test**: empty-string env vars (e.g. `ESEWA_SECRET=`
copied from .env.example) passed zod's `.default()` and silently became real
values — the server was HMAC-signing with "". config.ts now filters empty
strings before parsing (fixes the entire class: CLIENT_ORIGIN=, SMTP_URL=, …).

**Decisions / deviations**

1. **Checkout UI + countdown deferred to M5** — the client is still a
   placeholder; the §3.3 page belongs with the frontend foundation. M4's
   acceptance criteria (sandbox happy/replay/tamper tests) are backend and pass.
2. Still no MongoDB transactions: callback does ordered idempotent writes
   (uniqueness-guarded payment insert → status-guarded booking flip) — gateway
   retries + idempotency give equivalent recovery; replSet+tx at M8.
3. Gateway callbacks are SPA-relayed (eSewa v2 has no server webhook — it
   redirects with ?data=). Trust boundary is the signature/lookup, not the
   transport.
4. Venue payments stay `initiated` until the owner marks them paid (M6 dashboard).

---

## M5 — Player frontend (2026-07-07)

**Built**

- Frontend foundation (§2.2): Tailwind v4 with tokens extracted from
  design/00-system-sheet (pitch #0E3B2E, mint #BFD8CE, paper #F7F6F2, accent
  #FF6A2B, Anton/Figtree, 12px cards) — mockups honored as visual source of
  truth (§3.7). React Router v6, TanStack Query, Zustand, RHF + shared Zod
  schemas (same validation as the API), cva component kit (§3.6: Button, Field,
  Modal on native <dialog> — free focus trap/Esc, Toasts, EmptyState, Skeleton).
- Session plumbing (§2.7/§6.3): access token in memory only, silent restore via
  refresh cookie on boot, one-shot refresh-and-replay on 401 (concurrent 401s
  share one refresh), login redirect preserving ?next=.
- Pages: landing, venue search (URL-synced debounced filters, skeletons, empty
  state), **venue detail** (§3.2: 7-day availability grid with
  available/taken/blocked/past states + prices, arrow-key navigation,
  aria-labels per cell, court tabs, sticky booking bar, selection stashed in
  sessionStorage across the login redirect, SLOT_TAKEN toast + refetch,
  idempotencyKey on every booking POST), **checkout** (§3.3: server-issued
  10-min countdown, eSewa form auto-POST / Khalti redirect / pay-at-venue,
  gateway return-leg relay to /payments/callback, confirmed ticket, expired
  screen), **my bookings** (tabs, cancel modal with §7.4 policy, .ics download
  via shared slotStartUtc), full auth set (login w/ unverified interstitial,
  register, verify?token auto-login, forgot, reset, 60s resend cooldown).
- A11y (§3.0): skip link, landmarks, labels on all inputs, aria-describedby
  errors, grid keyboard nav, focus rings.

**Verified** by driving the real UI in the preview browser end-to-end:
landing → search (live API data) → grid (105 cells, real taken/blocked states)
→ slot select → login redirect + selection restore → book → checkout countdown
→ pay-at-venue → confirmed → my-bookings → cancel modal → cancelled. All four
CI gates green (71 tests, client typechecks, prod build 1.1s).

**Bug found**: stale Vite dep-optimizer cache after the dependency install
produced a duplicate-React "invalid hook call" crash — cleared node_modules/.vite.

**Decisions / deviations**

1. Lighthouse ≥90 (M5 DoD) not yet measured — no headless Chrome CLI on this
   machine; run at M8 hardening alongside the axe pass. A11y basics are in.
2. Refund preview: modal shows the §7.4 policy table; the server remains the
   only refund calculator (no preview endpoint in §4.4).
3. Playwright E2E deferred to M8 (blueprint lists the journeys as release
   gates); preview-browser walkthrough covered the critical path today.
4. Landing is a light hero (design/01's full marketing page can come with M8
   polish); photo gallery renders venue photos when present, no Cloudinary
   uploads wired into the UI yet (owner wizard is M6).

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

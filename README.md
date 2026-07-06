# CourtBook

Futsal court booking platform for Kathmandu — players discover courts and book
slots in real time; owners manage venues, schedules, and bookings.
Full spec: [docs/blueprint.md](docs/blueprint.md) · build log: [docs/PROGRESS.md](docs/PROGRESS.md)

## Stack

React 18 + TypeScript + Vite (client) · Node 20 + Express + Mongoose (server) ·
shared Zod schemas (`shared/`) · MongoDB Atlas · Render

## Getting started

```bash
npm install                 # installs all workspaces
docker compose up -d        # local MongoDB (27017) + MailHog (SMTP 1025, UI 8025)
cp .env.example server/.env # then adjust if needed
npm run dev:server          # API on http://localhost:3000
npm run dev:client          # SPA on http://localhost:5173 (proxies /api)
```

Health check: `GET http://localhost:3000/api/v1/health`

## Scripts (root)

| Script              | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `npm run lint`      | ESLint + Prettier check across the monorepo         |
| `npm run typecheck` | `tsc` in every workspace                            |
| `npm test`          | Vitest suites (Supertest + mongodb-memory-server)   |
| `npm run build`     | Builds shared → server → client                     |

CI (GitHub Actions) runs all four on every PR. Deploys via [render.yaml](render.yaml).

## Status

- ✅ **M0 — Foundations**: monorepo, Express core (middleware chain, error
  envelope, health endpoint), Docker, CI, Render blueprint
- ✅ **M1 — Auth**: register/verify/login, rotating refresh sessions with reuse
  detection, lockout, password reset, notification outbox (emails via MailHog in dev)
- ⏳ M2 — Venue & court domain (next)

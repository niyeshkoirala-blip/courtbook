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
- ✅ **M2 — Venues & courts**: owner CRUD with schedules/pricing, draft→review→
  approved lifecycle, admin approval queue with audit log, public search with
  filters + cursor pagination, Cloudinary signed uploads
- ✅ **M3 — Booking engine**: derived availability, atomic slot creation (unique
  partial index — zero double bookings under concurrent load), 10-min holds +
  expiry sweeper, cancellation with refund tiers, walk-ins, owner blocks
- ✅ **M4 — Payments**: eSewa + Khalti sandbox adapters, signature-verified
  idempotent callbacks with amount re-derivation, pay-at-venue, checkout polling
- ✅ **M5 — Player frontend**: Tailwind design system from the mockups,
  availability grid, booking flow with checkout countdown + all payment paths,
  my-bookings with cancel/.ics, full auth UI
- ⏳ M6 — Owner dashboard (next)

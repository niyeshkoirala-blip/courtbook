# Runbook — Launch

Pre-launch checklist and deploy steps. Deploy itself is **deferred** until a
hosting account exists (Render signup needs a card — logged in PROGRESS.md M0).

## Pre-launch gates (all must pass)

```bash
npm run lint && npm run typecheck && npm test && npm run build
npm audit --audit-level=high
npm run e2e                     # Playwright critical journeys (needs stack up)
```

Plus the manual/external gates:

- **k6 race test** (§11.5, release blocker): seed 100 users and fire —
  ```bash
  node scripts/race-test/seed.mjs "$MONGO_URI" 100
  k6 run scripts/race-test/race.k6.js       # threshold: exactly one 201
  ```
- **ZAP baseline scan** against the deployed staging URL:
  ```bash
  docker run -t ghcr.io/zaproxy/zaproxy zap-baseline.py -t https://<staging-url>
  ```
  Review and triage findings against docs/security-checklist.md.
- **Lighthouse** ≥ 90 perf/a11y on the venue page (M5 DoD) — run against the
  built client, not the dev server.

## Deploy (when hosting exists)

1. **MongoDB Atlas** — create an M0 cluster, a DB user, allow `0.0.0.0/0`
   (Render egress IPs vary). Connection string → `MONGO_URI`.
2. **API** — Render Blueprint reads `render.yaml`; set the `sync:false` secrets
   in the dashboard: `MONGO_URI`, `CLIENT_ORIGIN`, `JWT_SECRET`, `REFRESH_SECRET`
   (`openssl rand -hex 32` each), plus the optional gateway/LLM/Cloudinary keys.
   Prod boot **refuses placeholder JWT secrets** (`config.ts`) — real values required.
3. **Client** — static build; set `CLIENT_ORIGIN` to the client's URL and the
   API base to the API's URL.
4. **Seed demo data** on the fresh DB:
   ```bash
   node --env-file=server/.env --import tsx server/src/scripts/seed.ts
   ```
   Demo logins (password `demo-password-1`): `demo-admin@`, `demo-owner@`,
   `demo-player@courtbook.local`.
5. **Verify**: `GET /api/v1/health` → `db:"up"`; register→verify→book→pay
   sandbox journey; owner dashboard shows the seeded bookings.

## No-card hosting fallback (§ PROGRESS M0)

Client → Cloudflare Pages / GitHub Pages · DB → Atlas M0 · API → a host that
runs the Dockerfile without a card (e.g. HF Spaces — needs a port tweak).

## Rollback

Render keeps previous images — instant rollback in the dashboard. Migrations
must be backward-compatible one version (expand-migrate-contract, §10).

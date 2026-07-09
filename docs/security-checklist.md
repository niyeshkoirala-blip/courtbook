# Security Checklist

Maps blueprint §8 (threat table) and the OWASP Top 10 to where each control
lives in the code. Reviewed each release (§8 last row). `✓` = implemented and
tested; `◐` = implemented, provider-side or config-gated; `☐` = deferred (M8+).

## §8 Threat table

| Threat | Mitigation | Where | Status |
|---|---|---|---|
| Password storage | bcrypt cost 12 | `auth.service.ts` (`config.bcryptRounds`) | ✓ |
| Brute force | 5 fails → 15-min lock (423), reset on success, constant-time compare | `auth.service.ts` login (`MAX_FAILED_LOGINS`, `DUMMY_HASH`) | ✓ |
| JWT theft | 15-min access token in memory (never localStorage); refresh in httpOnly SameSite=Lax cookie; rotation + reuse detection → family revocation | `auth.service.ts` `rotateRefresh`, `client/src/lib/auth.ts` | ✓ |
| CSRF | state-changing routes require `Authorization` header (cookie alone insufficient); refresh endpoint additionally checks `Origin` allowlist | `auth.controller.ts` `refresh`, `requireAuth` | ✓ |
| XSS | React escaping; no `dangerouslySetInnerHTML`; CSP via helmet; note fields length-capped + trimmed by Zod | `app.ts` helmet, shared Zod schemas | ✓ |
| NoSQL injection | Zod coerces/strips types at the boundary; queries built only from validated primitives | `validate.ts`, all `*.service.ts` | ✓ |
| IDOR | every mutating service re-checks ownership (owner→venue, player→booking); cross-tenant returns 404 | `findOwnedVenue`, `cancelBooking`, `getBooking`, owner reads | ✓ tested |
| SSRF | outbound calls only to hardcoded gateway/LLM/Cloudinary/SMTP hosts (from config, never user input) | `khalti.ts`, `esewa.ts`, `assistant.service.ts` | ✓ |
| Payment forgery | webhook signature/lookup verified; amount re-derived from booking snapshot server-side; provider txn id unique (replay-proof); callback idempotent | `payment.service.ts` `handleCallback`, `esewa.ts` `verifyEsewaCallback` | ✓ tested |
| File upload | Cloudinary signed presets — backend signs, never receives bytes; size/MIME enforced provider-side | `venue.service.ts` `signPhotoUpload` | ◐ |
| Enumeration | uniform 200 on forgot-password; identical 401 for wrong-email vs wrong-password | `auth.service.ts` | ✓ tested |
| Secrets | env vars only; `.env.example` documents keys; empty strings treated as unset | `config.ts` (`definedEnv` filter); gitleaks in CI | ✓ |
| Headers | helmet defaults + HSTS + `X-Content-Type-Options` + strict CORS allowlist | `app.ts` | ✓ |
| Priv-escalation | role changes admin-only + audited; `requireRole` gate + service-level ownership re-check | `admin.routes.ts`, `requireRole` | ✓ |
| Audit | append-only `audit_logs` for admin mutations (no update/delete path) | `audit.model.ts` `writeAudit` | ✓ tested |
| Assistant | tools go through the same service layer (no privileged path); booking drafts need auth; identity from JWT not model input | `assistant/tools.ts`, `assistant.service.ts` | ✓ tested |

## OWASP Top 10 (2021)

| # | Category | Coverage |
|---|---|---|
| A01 | Broken Access Control | IDOR re-checks in every mutating service; `requireAuth`/`requireRole`; cross-tenant 404 tests |
| A02 | Cryptographic Failures | bcrypt-12 passwords; HMAC-SHA256 hashed refresh/verify/reset tokens; TLS terminated at Render (`trust proxy`) |
| A03 | Injection | Zod validation at every route boundary; Mongoose (no string-concatenated queries); React auto-escaping |
| A04 | Insecure Design | atomic booking index (no check-then-insert race); outbox for at-least-once email; rate-limit tiers |
| A05 | Security Misconfiguration | helmet, strict CORS allowlist, prod refuses placeholder JWT secrets (`config.ts`), no stack traces in prod errors |
| A06 | Vulnerable Components | `npm audit` in CI; Dependabot recommended post-launch |
| A07 | Auth Failures | lockout, reuse detection, uniform enumeration responses, email verification gate |
| A08 | Data Integrity | signed payment callbacks + amount re-derivation; append-only audit log |
| A09 | Logging Failures | pino structured logs with request-id; PII redaction (email/password/tokens); audit trail |
| A10 | SSRF | outbound host allowlist (config-driven, never user input) |

## Release gates (run each release)

- [ ] `npm run lint && npm run typecheck && npm test && npm run build` green
- [ ] `npm audit --audit-level=high` clean (or triaged)
- [ ] gitleaks scan clean (CI)
- [ ] k6 race test: 100 concurrent → exactly one 201 (`scripts/race-test/`, §11.5)
- [ ] Playwright critical journeys pass (`npm run e2e`)
- [ ] ZAP baseline scan reviewed (manual — see runbooks/launch.md)

## Deferred (documented, not yet done)

- **ZAP baseline scan** — needs a deployed URL; run against staging pre-launch.
- **migrate-mongo** — indexes via mongoose autoIndex until a prod DB exists;
  first prod migration creates them explicitly (§5.3).
- **MongoDB transactions** (§4.5) — payment/booking use ordered idempotent
  writes; add transactions once compose/prod runs a replica set.

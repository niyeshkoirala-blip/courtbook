# CourtBook — Approved Design Mockups

Source of truth for **look & feel**. Behavior/states/edge cases come from `docs/blueprint.md`.
Full page mapping: blueprint §3.7 Design Register.

## File formats
- `*.dc.html` — Claude Design canvas exports. They load `./support.js` (kept in this
  folder) — open them in a browser FROM this folder or the canvas won't render.
- `*.html` (no `.dc`) — fully standalone exports, open anywhere.

## Mapping (design prompt № → file → blueprint spec)
| № | File | Covers | Spec |
|---|---|---|---|
| 0 | `00-system-sheet.html` | Design system: tokens, buttons, inputs, badges, slot-cell states | §3.6 |
| 0b | `00b-brand-panel.dc.html` | Brand panel extra (turf gradient + corner-arc treatment) | — |
| 1 | `01-landing.dc.html` | Landing page | §3.5 |
| 2 | `02-search.dc.html` (+ `02-search-standalone.html`) | Venue search, filters, card states | §3.5 |
| 3 | `03-venue-detail.html` | Venue detail + availability grid (the money page) | §3.2 |
| 4–6 | `04-06-booking-flow.dc.html` | Checkout, hold-expired state, confirmed ticket, my bookings | §3.3, §3.5 |
| 7–8 | `07-08-auth-settings.dc.html` | Login, register, verify, reset, settings, sessions | §3.5, §6.3 |
| 9–10 | `09-10-owner-ops.dc.html` | Owner today dashboard, walk-in, block slot, week calendar | §3.4, §3.5 |
| 11 | `11-venue-wizard.dc.html` | 5-step venue setup wizard | §3.5 |
| 12 | `12-reports.dc.html` (+ `screenshots/12-reports-lower.png`) | Owner reports, charts, heatmap | §3.5 |
| 13 | `13-admin.dc.html` | Admin: approvals, users, audit, feature flags | Phase 12 |
| 14 | `14-assistant.dc.html` | AI assistant widget conversation | §3.5, §7.7 |
| 15 | **MISSING** — error/404/offline family not yet designed | run design prompt 15 | §3.0 |

## Rules for implementation (Claude Code: read this)
These files are visual reference ONLY — never copy their markup, inline styles, or JS
into `client/`. Read them to extract exact hex colors, spacing, radii, and font sizes;
render them in a browser to see the intended result; then build production components
per blueprint §2.2/§3.6 (React + Tailwind + cva, shared component library, real state).

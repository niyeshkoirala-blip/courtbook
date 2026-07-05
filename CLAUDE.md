# CLAUDE.md
CourtBook — futsal court booking platform (Kathmandu). Solo-dev portfolio project.

## Source of truth
The complete spec is docs/blueprint.md. ALWAYS read the relevant sections before
implementing. If code and blueprint conflict, flag it — never silently deviate.
Check docs/PROGRESS.md for what's already built and past decisions.

## Stack (fixed — do not substitute)
React 18 + TypeScript + Vite + Tailwind + TanStack Query + Zustand + React Hook Form + Zod
Node 20 + Express + Mongoose (MongoDB Atlas) + pino + node-cron
Tests: Vitest, Supertest + mongodb-memory-server, Playwright, k6
Deploy: Render (render.yaml), GitHub Actions CI

## Hard rules
- Layering: route → controller → service → model. Controllers never touch models.
- All input validated with shared Zod schemas from /shared at the route boundary.
- Never res.json() a mongoose doc — use DTO mappers. Never serialize passwordHash.
- All times: minutes-from-midnight in Asia/Kathmandu (UTC+5:45). Use the formatNPT util.
- Errors: throw AppError(code, status, message); one global error middleware.
- The booking uniqueness index (blueprint §5.2) is sacred. Never work around it.
- Write tests alongside features, not after. A milestone is done when its
  acceptance criteria in blueprint Phase 14 pass.
- Never leave the readme, update with every milestone.
- Proper commenting in the code

## Workflow
Plan first: before writing code, list the blueprint sections you read and present
a short implementation plan. Wait for approval on anything ambiguous.
At the end of a milestone: run the full test suite, then append a summary to
docs/PROGRESS.md (what was built, decisions, any deviation from blueprint + why).
# Graph Report - .  (2026-07-14)

## Corpus Check
- 130 files · ~89,649 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 795 nodes · 1490 edges · 109 communities (30 shown, 79 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.81)
- Token cost: 0 input · 33,371 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Backend Tests & Models|Backend Tests & Models]]
- [[_COMMUNITY_Client UI Components|Client UI Components]]
- [[_COMMUNITY_API Routes & Controllers|API Routes & Controllers]]
- [[_COMMUNITY_Vendored JS Framework|Vendored JS Framework]]
- [[_COMMUNITY_Shared Zod Schemas|Shared Zod Schemas]]
- [[_COMMUNITY_AI Assistant Service|AI Assistant Service]]
- [[_COMMUNITY_Server Dependencies|Server Dependencies]]
- [[_COMMUNITY_Client Dependencies|Client Dependencies]]
- [[_COMMUNITY_Admin & Audit Service|Admin & Audit Service]]
- [[_COMMUNITY_Root Dev Dependencies|Root Dev Dependencies]]
- [[_COMMUNITY_Payment Gateways|Payment Gateways]]
- [[_COMMUNITY_Auth Service|Auth Service]]
- [[_COMMUNITY_Booking Schemas|Booking Schemas]]
- [[_COMMUNITY_TS Base Config|TS Base Config]]
- [[_COMMUNITY_TS Base Config|TS Base Config]]
- [[_COMMUNITY_Package Manifests|Package Manifests]]
- [[_COMMUNITY_Client TS Config|Client TS Config]]
- [[_COMMUNITY_TS Project Refs|TS Project Refs]]
- [[_COMMUNITY_TS Project Refs|TS Project Refs]]
- [[_COMMUNITY_Seed Script|Seed Script]]
- [[_COMMUNITY_k6 Load Test|k6 Load Test]]
- [[_COMMUNITY_Deploy & Infra|Deploy & Infra]]
- [[_COMMUNITY_Prettier Config|Prettier Config]]
- [[_COMMUNITY_Prettier Config|Prettier Config]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 95|Community 95]]
- [[_COMMUNITY_Community 96|Community 96]]
- [[_COMMUNITY_Community 97|Community 97]]
- [[_COMMUNITY_Community 98|Community 98]]
- [[_COMMUNITY_Community 99|Community 99]]
- [[_COMMUNITY_Community 100|Community 100]]
- [[_COMMUNITY_Community 101|Community 101]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Community 103|Community 103]]
- [[_COMMUNITY_Community 104|Community 104]]
- [[_COMMUNITY_Community 105|Community 105]]
- [[_COMMUNITY_Community 106|Community 106]]

## God Nodes (most connected - your core abstractions)
1. `ok()` - 34 edges
2. `config` - 23 edges
3. `AppError` - 18 edges
4. `Venue` - 15 edges
5. `useAuth` - 14 edges
6. `connectDb()` - 14 edges
7. `disconnectDb()` - 14 edges
8. `queueEmail()` - 14 edges
9. `User` - 14 edges
10. `findOwnedVenue()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `courtbook-api (Render web/docker service)` --references--> `@courtbook/server`  [INFERRED]
  render.yaml → server/package.json
- `courtbook-client (Render static service)` --references--> `@courtbook/shared`  [EXTRACTED]
  render.yaml → client/package.json
- `ConfirmedCard()` --calls--> `formatNPT()`  [INFERRED]
  client/src/pages/checkout.tsx → shared/src/npt.ts
- `downloadIcs()` --calls--> `slotStartUtc()`  [INFERRED]
  client/src/pages/my-bookings.tsx → shared/src/npt.ts
- `TodayBoard()` --calls--> `nowNPT()`  [INFERRED]
  client/src/pages/owner/dashboard.tsx → shared/src/npt.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Player Booking Flow (search to confirmed ticket)** — design_01_landing, design_02_search, design_03_venue_detail, design_04_06_booking_flow [INFERRED 0.75]
- **Owner Management Flow (wizard, ops, reports)** — design_11_venue_wizard, design_09_10_owner_ops, design_12_reports [INFERRED 0.75]
- **Zero-Double-Booking Guarantee** — blueprint_booking_index, blueprint_atomic_booking, blueprint_race_gate, blueprint_expiry_sweeper [EXTRACTED 0.90]
- **M0–M8 Development Roadmap** — blueprint_m0, blueprint_m1, blueprint_m2, blueprint_m3, blueprint_m4, blueprint_m5, blueprint_m6, blueprint_m7, blueprint_m8 [EXTRACTED 0.90]
- **CI & Release Gate Pipeline** — ci_workflow, ci_security_job, blueprint_race_gate, security_checklist_doc, launch_runbook [EXTRACTED 0.85]
- **CourtBook npm workspaces monorepo** — package_root, package_client, package_server, package_shared [EXTRACTED 1.00]
- **TypeScript composite project reference graph** — tsconfig_base, tsconfig_client, tsconfig_server, tsconfig_shared [EXTRACTED 1.00]
- **Render deployment (API + static SPA)** — render_courtbook_api, render_courtbook_client [EXTRACTED 1.00]

## Communities (109 total, 79 thin omitted)

### Community 0 - "Backend Tests & Models"
Cohesion: 0.06
Nodes (69): app, D2, app, lastEmailToken(), refreshCookie(), registerAndVerify(), userInput(), Booking (+61 more)

### Community 1 - "Client UI Components"
Cohesion: 0.06
Nodes (59): Layout(), AssistantWidget(), ChatMessage, Modal(), button, ButtonProps, EmptyState(), Field (+51 more)

### Community 2 - "API Routes & Controllers"
Cohesion: 0.06
Nodes (54): adminRouter, statusQuery, assistantRouter, forgotPassword(), login(), refresh(), register(), resendVerification() (+46 more)

### Community 3 - "Vendored JS Framework"
Cohesion: 0.07
Nodes (42): boot(), collectProps(), compileAttr(), compileTemplate(), contentKey(), createComponentFactory(), createExternalModules(), createHelmetManager() (+34 more)

### Community 4 - "Shared Zod Schemas"
Cohesion: 0.04
Nodes (41): AssistantChatInput, assistantChatSchema, AssistantReply, emailOnlySchema, LoginInput, loginSchema, RegisterInput, registerSchema (+33 more)

### Community 5 - "AI Assistant Service"
Cohesion: 0.10
Nodes (33): capHistory(), chat(), getClient(), getSession(), Session, sessions, _setClientForTests(), ASSISTANT_TOOLS (+25 more)

### Community 6 - "Server Dependencies"
Cohesion: 0.05
Nodes (40): dependencies, @anthropic-ai/sdk, bcryptjs, cookie-parser, cors, @courtbook/shared, express, express-rate-limit (+32 more)

### Community 7 - "Client Dependencies"
Cohesion: 0.07
Nodes (34): dependencies, class-variance-authority, @courtbook/shared, @hookform/resolvers, react, react-dom, react-hook-form, react-router-dom (+26 more)

### Community 8 - "Admin & Audit Service"
Cohesion: 0.12
Nodes (27): approveVenue(), notifyOwner(), rejectVenue(), reviewableVenue(), AuditLog, AuditLogDoc, auditSchema, writeAudit() (+19 more)

### Community 9 - "Root Dev Dependencies"
Cohesion: 0.07
Nodes (28): dependencies, cloudinary, mongodb, devDependencies, eslint, eslint-config-prettier, prettier, @types/node (+20 more)

### Community 10 - "Payment Gateways"
Cohesion: 0.19
Nodes (19): buildEsewaRedirect(), sign(), VerifiedCallback, verifyEsewaCallback(), initiateKhalti(), khaltiPost(), requireKey(), verifyKhaltiCallback() (+11 more)

### Community 11 - "Auth Service"
Cohesion: 0.19
Nodes (19): DUMMY_HASH, forgotPassword(), hashToken(), issueSession(), login(), logout(), register(), resendVerification() (+11 more)

### Community 12 - "Booking Schemas"
Cohesion: 0.11
Nodes (18): AvailabilityDay, availabilityQuerySchema, AvailabilitySlot, BlockCreateInput, blockCreateSchema, BlockDto, bookingCancelSchema, BookingCreateInput (+10 more)

### Community 13 - "TS Base Config"
Cohesion: 0.13
Nodes (16): compilerOptions, declaration, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, module, moduleResolution, noUncheckedIndexedAccess (+8 more)

### Community 14 - "TS Base Config"
Cohesion: 0.14
Nodes (13): compilerOptions, declaration, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, module, moduleResolution, noUncheckedIndexedAccess (+5 more)

### Community 15 - "Package Manifests"
Cohesion: 0.24
Nodes (11): dependencies, zod, main, name, private, scripts, build, typecheck (+3 more)

### Community 16 - "Client TS Config"
Cohesion: 0.20
Nodes (10): compilerOptions, declaration, jsx, lib, module, moduleResolution, noEmit, sourceMap (+2 more)

### Community 17 - "TS Project Refs"
Cohesion: 0.25
Nodes (9): compilerOptions, composite, outDir, rootDir, types, exclude, extends, include (+1 more)

### Community 18 - "TS Project Refs"
Cohesion: 0.32
Nodes (6): compilerOptions, composite, outDir, rootDir, extends, include

### Community 19 - "Seed Script"
Cohesion: 0.33
Nodes (5): count, date, npt, tokens, users

### Community 20 - "k6 Load Test"
Cohesion: 0.40
Nodes (4): booked, conflicts, input, options

### Community 21 - "Deploy & Infra"
Cohesion: 0.50
Nodes (4): Health Endpoint (/api/v1/health), migrate-mongo Migration Strategy, Client index.html SPA Shell, Render Deploy Blueprint

### Community 22 - "Prettier Config"
Cohesion: 0.50
Nodes (3): printWidth, singleQuote, trailingComma

### Community 23 - "Prettier Config"
Cohesion: 0.50
Nodes (3): printWidth, singleQuote, trailingComma

## Knowledge Gaps
- **318 isolated node(s):** `singleQuote`, `trailingComma`, `printWidth`, `dev`, `build` (+313 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **79 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `nowNPT()` connect `Client UI Components` to `Backend Tests & Models`, `AI Assistant Service`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **Why does `formatNPT()` connect `Client UI Components` to `Payment Gateways`, `AI Assistant Service`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `main()` connect `Backend Tests & Models` to `Client UI Components`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **What connects `singleQuote`, `trailingComma`, `printWidth` to the rest of the system?**
  _336 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Backend Tests & Models` be split into smaller, more focused modules?**
  _Cohesion score 0.05921052631578947 - nodes in this community are weakly interconnected._
- **Should `Client UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.05960729312762973 - nodes in this community are weakly interconnected._
- **Should `API Routes & Controllers` be split into smaller, more focused modules?**
  _Cohesion score 0.05570745044429255 - nodes in this community are weakly interconnected._
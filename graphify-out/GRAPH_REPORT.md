# Graph Report - .  (2026-07-11)

## Corpus Check
- 129 files · ~88,951 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 752 nodes · 1539 edges · 34 communities (31 shown, 3 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 56 edges (avg confidence: 0.79)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Booking & Availability Domain|Booking & Availability Domain]]
- [[_COMMUNITY_React Client UI|React Client UI]]
- [[_COMMUNITY_API Routes & Middleware|API Routes & Middleware]]
- [[_COMMUNITY_Server Core & Notifications|Server Core & Notifications]]
- [[_COMMUNITY_Design Mockup Runtime|Design Mockup Runtime]]
- [[_COMMUNITY_Blueprint Spec & Milestones|Blueprint Spec & Milestones]]
- [[_COMMUNITY_Server Dependencies|Server Dependencies]]
- [[_COMMUNITY_Auth & Admin Services|Auth & Admin Services]]
- [[_COMMUNITY_Client Dependencies|Client Dependencies]]
- [[_COMMUNITY_Root Workspace Config|Root Workspace Config]]
- [[_COMMUNITY_Payments (eSewaKhalti)|Payments (eSewa/Khalti)]]
- [[_COMMUNITY_Shared Booking Schemas|Shared Booking Schemas]]
- [[_COMMUNITY_Design Screen Mockups|Design Screen Mockups]]
- [[_COMMUNITY_Shared Venue Schemas|Shared Venue Schemas]]
- [[_COMMUNITY_Base TS Config|Base TS Config]]
- [[_COMMUNITY_Shared Package Config|Shared Package Config]]
- [[_COMMUNITY_Client TS Config|Client TS Config]]
- [[_COMMUNITY_Server TS Config|Server TS Config]]
- [[_COMMUNITY_Shared Auth Schemas|Shared Auth Schemas]]
- [[_COMMUNITY_Shared Payment Schemas|Shared Payment Schemas]]
- [[_COMMUNITY_Reports Screen Analytics|Reports Screen Analytics]]
- [[_COMMUNITY_Shared API Contracts|Shared API Contracts]]
- [[_COMMUNITY_Shared TS Config|Shared TS Config]]
- [[_COMMUNITY_Race Test Seed|Race Test Seed]]
- [[_COMMUNITY_k6 Race Load Test|k6 Race Load Test]]
- [[_COMMUNITY_Prettier Config|Prettier Config]]
- [[_COMMUNITY_Admin Panel Concept|Admin Panel Concept]]
- [[_COMMUNITY_API Envelope Concept|API Envelope Concept]]
- [[_COMMUNITY_Rate Limiting Concept|Rate Limiting Concept]]

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
- `ConfirmedCard()` --calls--> `formatNPT()`  [INFERRED]
  client/src/pages/checkout.tsx → shared/src/npt.ts
- `downloadIcs()` --calls--> `slotStartUtc()`  [INFERRED]
  client/src/pages/my-bookings.tsx → shared/src/npt.ts
- `WeekMatrix()` --calls--> `nowNPT()`  [INFERRED]
  client/src/pages/owner/calendar.tsx → shared/src/npt.ts
- `TodayBoard()` --calls--> `nowNPT()`  [INFERRED]
  client/src/pages/owner/dashboard.tsx → shared/src/npt.ts
- `WalkinModal()` --calls--> `nowNPT()`  [INFERRED]
  client/src/pages/owner/dashboard.tsx → shared/src/npt.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Zero-Double-Booking Guarantee** — blueprint_booking_index, blueprint_atomic_booking, blueprint_race_gate, blueprint_expiry_sweeper [EXTRACTED 0.90]
- **CI & Release Gate Pipeline** — ci_workflow, ci_security_job, blueprint_race_gate, security_checklist_doc, launch_runbook [EXTRACTED 0.85]
- **M0–M8 Development Roadmap** — blueprint_m0, blueprint_m1, blueprint_m2, blueprint_m3, blueprint_m4, blueprint_m5, blueprint_m6, blueprint_m7, blueprint_m8 [EXTRACTED 0.90]
- **Player Booking Flow (search to confirmed ticket)** — design_01_landing, design_02_search, design_03_venue_detail, design_04_06_booking_flow [INFERRED 0.75]
- **Owner Management Flow (wizard, ops, reports)** — design_11_venue_wizard, design_09_10_owner_ops, design_12_reports [INFERRED 0.75]

## Communities (34 total, 3 thin omitted)

### Community 0 - "Booking & Availability Domain"
Cohesion: 0.06
Nodes (72): app, D2, runTool(), computeAvailability(), getBookableCourt(), sameDayAlternatives(), Block, BlockDoc (+64 more)

### Community 1 - "React Client UI"
Cohesion: 0.06
Nodes (55): Layout(), AssistantWidget(), ChatMessage, Modal(), button, ButtonProps, EmptyState(), Field (+47 more)

### Community 2 - "API Routes & Middleware"
Cohesion: 0.06
Nodes (56): adminRouter, statusQuery, assistantRouter, forgotPassword(), login(), refresh(), register(), resendVerification() (+48 more)

### Community 3 - "Server Core & Notifications"
Cohesion: 0.07
Nodes (47): chat(), getClient(), getSession(), Session, sessions, _setClientForTests(), ASSISTANT_TOOLS, ToolContext (+39 more)

### Community 4 - "Design Mockup Runtime"
Cohesion: 0.07
Nodes (42): boot(), collectProps(), compileAttr(), compileTemplate(), contentKey(), createComponentFactory(), createExternalModules(), createHelmetManager() (+34 more)

### Community 5 - "Blueprint Spec & Milestones"
Cohesion: 0.06
Nodes (53): AppError + Global Error Middleware, Assistant Guardrails (§7.7), Atomic Booking Rule (§7.3), Append-only Audit Log, JWT + Rotating Refresh Session Model, Derived Availability Engine, Availability Grid (venue detail money page), Booking Uniqueness Partial Index (sacred index) (+45 more)

### Community 6 - "Server Dependencies"
Cohesion: 0.05
Nodes (39): dependencies, @anthropic-ai/sdk, bcryptjs, cookie-parser, cors, @courtbook/shared, express, express-rate-limit (+31 more)

### Community 7 - "Auth & Admin Services"
Cohesion: 0.12
Nodes (27): approveVenue(), notifyOwner(), rejectVenue(), reviewableVenue(), AuditLog, AuditLogDoc, auditSchema, writeAudit() (+19 more)

### Community 8 - "Client Dependencies"
Cohesion: 0.07
Nodes (27): dependencies, class-variance-authority, @courtbook/shared, @hookform/resolvers, react, react-dom, react-hook-form, react-router-dom (+19 more)

### Community 9 - "Root Workspace Config"
Cohesion: 0.08
Nodes (25): devDependencies, eslint, eslint-config-prettier, prettier, @types/node, typescript, typescript-eslint, engines (+17 more)

### Community 10 - "Payments (eSewa/Khalti)"
Cohesion: 0.19
Nodes (19): buildEsewaRedirect(), sign(), VerifiedCallback, verifyEsewaCallback(), initiateKhalti(), khaltiPost(), requireKey(), verifyKhaltiCallback() (+11 more)

### Community 11 - "Shared Booking Schemas"
Cohesion: 0.11
Nodes (18): AvailabilityDay, availabilityQuerySchema, AvailabilitySlot, BlockCreateInput, blockCreateSchema, BlockDto, bookingCancelSchema, BookingCreateInput (+10 more)

### Community 12 - "Design Screen Mockups"
Cohesion: 0.20
Nodes (17): Availability Slot-Grid Pattern (free/available/booked cells), Scoreboard Search Card Pattern, Design System Sheet, Brand Panel (turf gradient + corner-arc), Landing Screen, Venue Search Screen, Venue Search (standalone export), Venue Detail + Availability Grid (+9 more)

### Community 13 - "Shared Venue Schemas"
Cohesion: 0.12
Nodes (16): AMENITIES, CourtCreateInput, courtCreateSchema, CourtDto, courtUpdateSchema, dayScheduleSchema, minutesOfDay, priceOverrideSchema (+8 more)

### Community 14 - "Base TS Config"
Cohesion: 0.14
Nodes (13): compilerOptions, declaration, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, module, moduleResolution, noUncheckedIndexedAccess (+5 more)

### Community 15 - "Shared Package Config"
Cohesion: 0.17
Nodes (11): dependencies, zod, main, name, private, scripts, build, typecheck (+3 more)

### Community 16 - "Client TS Config"
Cohesion: 0.18
Nodes (10): compilerOptions, declaration, jsx, lib, module, moduleResolution, noEmit, sourceMap (+2 more)

### Community 17 - "Server TS Config"
Cohesion: 0.20
Nodes (9): compilerOptions, composite, outDir, rootDir, types, exclude, extends, include (+1 more)

### Community 18 - "Shared Auth Schemas"
Cohesion: 0.20
Nodes (9): emailOnlySchema, LoginInput, loginSchema, RegisterInput, registerSchema, ResetPasswordInput, resetPasswordSchema, tokenSchema (+1 more)

### Community 19 - "Shared Payment Schemas"
Cohesion: 0.20
Nodes (9): esewaCallbackSchema, khaltiCallbackSchema, PAYMENT_PROVIDERS, PaymentDto, PaymentInitiateInput, paymentInitiateSchema, PaymentProvider, PaymentRedirect (+1 more)

### Community 20 - "Reports Screen Analytics"
Cohesion: 0.28
Nodes (9): Bookings Table, Busiest Slot Insight (Fri 6-7 PM, 100% booked), App Channel Badge, Dead-to-Busy Occupancy Legend, Occupancy by Slot Heatmap, Quiet Spot Insight (Tue 2 PM, discount suggestion), Revenue Insight (Rs 22,000 above last month), Reports Screen (Lower) (+1 more)

### Community 21 - "Shared API Contracts"
Cohesion: 0.22
Nodes (7): AssistantChatInput, assistantChatSchema, AssistantReply, ApiError, ApiResponse, ApiSuccess, HealthStatus

### Community 22 - "Shared TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, composite, outDir, rootDir, extends, include

### Community 23 - "Race Test Seed"
Cohesion: 0.33
Nodes (5): count, date, npt, tokens, users

### Community 24 - "k6 Race Load Test"
Cohesion: 0.40
Nodes (4): booked, conflicts, input, options

### Community 25 - "Prettier Config"
Cohesion: 0.50
Nodes (3): printWidth, singleQuote, trailingComma

## Knowledge Gaps
- **271 isolated node(s):** `singleQuote`, `trailingComma`, `printWidth`, `name`, `version` (+266 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `nowNPT()` connect `React Client UI` to `Booking & Availability Domain`, `Server Core & Notifications`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Why does `formatNPT()` connect `React Client UI` to `Booking & Availability Domain`, `Payments (eSewa/Khalti)`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `main()` connect `Booking & Availability Domain` to `React Client UI`, `Server Core & Notifications`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **What connects `singleQuote`, `trailingComma`, `printWidth` to the rest of the system?**
  _275 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Booking & Availability Domain` be split into smaller, more focused modules?**
  _Cohesion score 0.05592105263157895 - nodes in this community are weakly interconnected._
- **Should `React Client UI` be split into smaller, more focused modules?**
  _Cohesion score 0.06400208986415883 - nodes in this community are weakly interconnected._
- **Should `API Routes & Middleware` be split into smaller, more focused modules?**
  _Cohesion score 0.05721168322794339 - nodes in this community are weakly interconnected._
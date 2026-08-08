# KLICKIT FINANCE ERP — Phase 3

## System Architecture (Part 1 of 3): Architectural Style, Structure & Code Organization

| Field | Value |
|---|---|
| **Document ID** | KFE-ARC-001 |
| **Version** | 1.0 |
| **Date** | 14 July 2026 |
| **Traces to** | KFE-SRS-001, KFE-FRD-001, KFE-BRC-001 (both approved) |
| **Companions** | KFE-ARC-002 (Communication & Auth), KFE-ARC-003 (Deployment & Infrastructure) |

---

# 1. Architectural Drivers

Ranked forces extracted from approved requirements — every decision below traces to these:

| # | Driver | Source |
|---|---|---|
| D1 | **Financial integrity above all**: every money mutation is one ACID transaction spanning document + sub-ledger + GL (posting service choke point) | NFR-INT-001, FR-ACC-001.1, BR-GEN-02/06 |
| D2 | **Hundreds of independent single-tenant deployments** on modest school servers (4 vCPU/8 GB), operated by one non-specialist admin per school | §2.1/2.2 SRS, NFR-PORT |
| D3 | **Offline-tolerant**: full function without internet; integrations queue and retry | §2.4, FR-INTG-008 |
| D4 | **Mandated stack**: NestJS/TypeORM/PostgreSQL/Redis/BullMQ; Next.js App Router frontend; Docker/Nginx | §2.6 |
| D5 | **Strict module boundaries with one hard isolation case** (licensing module — structural, CI-enforced) | FR-LIC-004, BR-LIC-02 |
| D6 | **Peak-load shape**: bursty counter collections at term open; heavy background jobs (bulk billing, payroll, comms) must not degrade interactive latency | NFR-PERF-001/004 |
| D7 | **10-year data horizon, auditability, immutability** | NFR-SCAL-001, BR-GEN-03 |
| D8 | **Team reality**: one product team shipping a versioned product, not per-school code | NFR-MNT-006 |

# 2. Architectural Style Decision

## 2.1 Recommendation: **Modular Monolith** (with a split runtime: API process + Worker process from one codebase)

### ADR-001 — Modular Monolith over Microservices

**Decision:** One NestJS application, internally partitioned into strictly-bounded modules, deployed as two runtime processes (HTTP API and background Worker) sharing one codebase, one PostgreSQL database, one Redis. Next.js is a separate frontend deployable.

**Why microservices lose on every driver:**

| Driver | Microservices consequence | Modular monolith consequence |
|---|---|---|
| D1 Financial ACID | Receipt posting would span payment-service + ledger-service + wallet-service → distributed transactions (sagas, compensation, eventual consistency) — precisely what BR-GEN-06 forbids for money | One `SERIALIZABLE`-capable DB transaction per posting. Simple, provable |
| D2 Ops burden | 15+ containers, service discovery, per-service versioning — on a school server run by one admin, ×300 schools | ~8 containers total, one version number per release |
| D3 Offline | Inter-service resilience machinery for zero benefit (no independent scaling need inside one school) | In-process calls; queues only where async is semantically required |
| D6 Load shape | Independent scaling is the one real microservice benefit — but our load ceiling is 10k students on one host | Worker process isolates heavy jobs from interactive latency — the only split the load shape actually demands |
| D8 Team | N repos/pipelines for one team | One repo, one pipeline, module ownership by folder |

**Consequences & guardrails:** The monolith's classic failure mode — boundary erosion into a big ball of mud — is countered by: (a) Nest module encapsulation with explicit `exports` only; (b) ESLint `import/no-restricted-paths` rules generated from a module dependency manifest (build fails on illegal imports); (c) every cross-module financial interaction flows through published module APIs (services), never repositories; (d) domain events for non-transactional coupling. **Extraction path** (documented, not planned): any module already communicates via its service interface + events, so a future genuine scaling need (e.g., a regional cloud multi-school offering) can lift a module out behind the same interface.

### ADR-002 — Single database, schema-per-concern naming

One PostgreSQL database per school (D2), with tables prefixed by module concern via TypeORM naming strategy (`bill_invoice`, `pay_receipt`, `gl_journal_line`…). The licensing module gets its own PostgreSQL **schema** (`license.*`) and its own DB role that can access only that schema — the structural isolation demanded by FR-LIC-004 enforced at the database layer, not just code review.

### ADR-003 — API process / Worker process split

Same image, two entrypoints: `main.api.ts` (HTTP + WebSocket) and `main.worker.ts` (BullMQ processors + cron). Rationale: D6 — bulk billing/payroll/report/backup jobs get their own CPU/memory envelope and can be scaled or nice'd independently; a wedged job can never take down counter collections. Both processes share modules; processors live beside their module's services.

### ADR-004 — Frontend as separate deployable (Next.js standalone)

Next.js App Router app consuming the public REST API v1 exclusively (FR-API-001 — the frontend is customer zero of the API). Server components for shell/layout + static content; all data fetching client-side via TanStack Query against `/api/v1` (consistent auth, cache, and offline behavior; no duplicated data path through Next server).

# 3. System Diagrams

## 3.1 C4 Level 1 — System Context

```
                         ┌──────────────────────────┐
   Parents/Guardians ───▶│                          │◀─── Staff (Bursar, Cashier,
   (mobile PWA, M-Pesa)  │   KLICKIT FINANCE ERP    │      Accountant, Admin…)
                         │   (one school instance)  │
   POS Operators ───────▶│                          │◀─── Auditors (read-only)
                         └────┬─────┬─────┬─────┬───┘
                              │     │     │     │
              ┌───────────────┘     │     │     └────────────────┐
              ▼                     ▼     ▼                      ▼
     Safaricom Daraja        SMS Gateways  SMTP           Accounting SaaS
     (STK/C2B/B2C)           Firebase FCM  (email)        (QuickBooks/Xero/Sage)
              ▲
              │ licensing API only (mutual auth, enumerated endpoints)
     ┌────────┴─────────┐
     │ Klickit Super    │   NO access to financial data — structurally isolated
     │ Admin Portal     │   license.* schema + dedicated DB role
     └──────────────────┘
```

## 3.2 C4 Level 2 — Containers (one school instance)

```
┌─ School Server (Docker Compose) ─────────────────────────────────────────────┐
│                                                                              │
│  ┌─────────┐   HTTPS    ┌──────────────┐    ┌───────────────────────────┐    │
│  │  NGINX  │──────────▶│  web (Next.js │    │  api (NestJS, N replicas) │    │
│  │ TLS,    │  /        │  standalone)  │    │  REST /api/v1 + WS        │    │
│  │ rate    │──────────────────────────────▶│  guards→services→posting  │    │
│  │ limits  │  /api,/ws └──────────────┘    └─────┬──────────┬──────────┘    │
│  └────┬────┘                                     │          │               │
│       │ /callbacks (M-Pesa, webhooks)            ▼          ▼               │
│       └────────────────────────────▶┌────────────────┐ ┌─────────┐          │
│                                     │  PostgreSQL 16 │ │ Redis 7 │          │
│  ┌────────────────────────┐         │  app schema +  │ │ cache/  │          │
│  │ worker (NestJS)        │◀───────▶│  license schema│ │ queues/ │          │
│  │ BullMQ processors:     │         └────────────────┘ │ ws-pubsub│         │
│  │ billing.bulk, comms.*, │                            └─────────┘          │
│  │ mpesa.query, payroll,  │         ┌────────────────┐                      │
│  │ reports, backup, cron  │◀───────▶│ MinIO (S3)     │                      │
│  └────────────────────────┘         │ files, exports,│                      │
│                                     │ backups        │                      │
│                                     └────────────────┘                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 3.3 C4 Level 3 — Backend module map & allowed dependencies

```
                       ┌────────────────────────────────────────────┐
                       │            SHARED KERNEL (libs)            │
                       │ money · ids · audit · events · pagination  │
                       │ rbac decorators · Money type · exceptions  │
                       └────────────────────────────────────────────┘
                                          ▲  (everyone may import)
 ┌─ PLATFORM MODULES ──────────────────────────────────────────────────────────┐
 │ auth  users  settings  branding  comms  approvals  files  reporting-engine  │
 └──────────────────────────────────────────────────────────────────────────┬──┘
                                          ▲                                 │
 ┌─ DOMAIN MODULES ────────────────────────────────────────────┐            │
 │ students  billing  payments  wallet  procurement  inventory │──may use──▶│
 │ expenses  payroll  banking  fixed-assets                    │            │
 └──────────────────────────────────────┬──────────────────────┘            │
                                        │ ALL financial postings            │
                                        ▼                                   │
 ┌─ ACCOUNTING CORE ────────────────────────────────────────────┐           │
 │ accounting: posting-service (sole GL writer) · CoA · periods │◀──────────┘
 │ journals · numbering-service (gapless) · integrity-sweep     │
 └──────────────────────────────────────────────────────────────┘

 ┌─ ISOLATED ──────────────────────────────────────────────────┐
 │ licensing: own DB schema+role; imports shared-kernel ONLY;  │
 │ no import from/to any other module (CI-enforced)            │
 └─────────────────────────────────────────────────────────────┘
```

**Dependency rules (enforced by lint manifest):**
1. Domain modules → accounting core, platform modules, shared kernel. Never each other's repositories; cross-domain calls use exported services (e.g., `payments` calls `WalletService.debit()`, never touches `wall_*` tables).
2. Accounting core imports only shared kernel.
3. `licensing` ↔ nothing (shared kernel only). `reporting-engine` may **read** cross-module via dedicated read-model queries (CQRS-lite read side) — the one sanctioned cross-cutting reader, still blocked from `license.*` and payroll detail without permission context.
4. Events (post-commit) are the escape hatch for reactions without coupling: `payments` emits `payment.posted`; `comms`, `dashboard` read-models subscribe.

# 4. Repository & Package Structure

## 4.1 Monorepo layout (pnpm workspaces)

```
klickit-finance-erp/
├── package.json  pnpm-workspace.yaml  turbo.json  .editorconfig
├── docs/                          # phase deliverables (this corpus)
├── apps/
│   ├── api/                       # NestJS runtime — HTTP entry
│   │   ├── src/main.api.ts
│   │   └── src/app.module.ts
│   ├── worker/                    # NestJS runtime — queues/cron entry
│   │   └── src/main.worker.ts
│   └── web/                       # Next.js App Router frontend
├── packages/
│   ├── server/                    # ALL backend modules (imported by api & worker)
│   │   └── src/
│   │       ├── shared/            # shared kernel
│   │       │   ├── money/         # Money type, rounding matrix (NFR-INT-004)
│   │       │   ├── audit/         # audit interceptor, hash chain
│   │       │   ├── events/        # typed domain events + outbox
│   │       │   ├── rbac/          # @RequirePermission(), guards
│   │       │   ├── database/      # base entity, naming strategy, tx helper
│   │       │   └── ...
│   │       ├── platform/
│   │       │   ├── auth/  users/  settings/  branding/  comms/
│   │       │   ├── approvals/  files/  reporting/
│   │       ├── accounting/        # accounting core (posting, CoA, periods, numbering)
│   │       ├── domains/
│   │       │   ├── students/  billing/  payments/  wallet/
│   │       │   ├── procurement/  inventory/  expenses/
│   │       │   ├── payroll/  banking/  fixed-assets/
│   │       ├── licensing/         # isolated (own tsconfig path rules)
│   │       └── migrations/        # TypeORM migrations, ordered, reversible
│   ├── contracts/                 # OpenAPI-derived TS types + DTO zod schemas
│   │                              # shared by web & external SDK consumers
│   └── config/                    # eslint, tsconfig, jest presets + module-deps.json
└── tools/                         # installers, backup scripts, seeders, fixtures
```

`module-deps.json` is the machine-readable dependency manifest from §3.3; a lint rule + CI check fail the build on any undeclared import edge (ADR-001 guardrail, BR-LIC-02).

## 4.2 Anatomy of a backend module (uniform, every module)

```
domains/billing/
├── billing.module.ts              # Nest module; exports ONLY billing.service + events
├── api/                           # presentation layer
│   ├── invoices.controller.ts     # thin: DTO → service; @ApiTags Swagger
│   ├── fee-structures.controller.ts
│   └── dto/                       # class-validator DTOs (+ zod mirror in contracts/)
├── application/                   # use-case services (transaction owners)
│   ├── billing.service.ts
│   ├── bulk-billing.service.ts
│   └── concession.service.ts
├── domain/                        # entities + pure business rules
│   ├── invoice.entity.ts          # TypeORM entity (persistence-annotated domain object)
│   ├── invoice.state.ts           # state machine (BR-enforced transitions)
│   └── policies/late-fee.policy.ts
├── infrastructure/
│   ├── invoice.repository.ts      # custom repositories; ONLY place touching bill_* tables
│   └── billing.posting-maps.ts    # P-01…P-07 posting scheme builders
├── jobs/
│   ├── billing-bulk.processor.ts  # BullMQ processor (runs in worker)
│   └── late-fee.cron.ts
├── events/
│   ├── invoice-posted.event.ts    # published
│   └── handlers/payment-posted.handler.ts   # subscribed
└── __tests__/                     # unit + integration co-located
```

Layering: controllers never touch repositories; services own transactions via the shared `tx()` helper; repositories never leave their module; posting maps call `PostingService` inside the caller's transaction (D1).

## 4.3 Frontend structure (apps/web)

```
apps/web/src/
├── app/                           # App Router
│   ├── (auth)/login/ …            # public segment
│   ├── (portal)/…                 # parent portal segment (own layout/nav)
│   ├── (erp)/                     # staff app segment
│   │   ├── layout.tsx             # shell: sidebar, topbar, notification center
│   │   ├── dashboard/
│   │   ├── billing/{invoices,fee-structures,concessions,statements}/
│   │   ├── payments/{collect,sessions,suspense,mpesa}/
│   │   ├── wallet/  procurement/  inventory/  expenses/
│   │   ├── payroll/  banking/  accounting/  assets/
│   │   ├── reports/  approvals/  settings/  branding/
│   │   └── ops/
│   └── api/theme/route.ts         # serves school design tokens (FR-BRND-001.1)
├── features/<module>/             # feature logic: hooks, api clients, forms, tables
│   └── billing/{api,hooks,components,schemas}/
├── components/
│   ├── ui/                        # shadcn/ui primitives (token-themed)
│   ├── patterns/                  # QueryBoundary (6 states, IR-003), MoneyInput,
│   │                              # DataTable, ApprovalTrail, DocumentHeader…
│   └── charts/                    # Recharts wrappers w/ dataviz standards
├── lib/{api-client,auth,ws,i18n,money,permissions}.ts
└── styles/tokens.css              # CSS variables ← Infoney defaults, overridden per school
```

Conventions: every route folder ships `loading.tsx`, `error.tsx`, and permission gate; feature API clients are generated from `packages/contracts` (OpenAPI → typed client) so frontend/backend drift is a build failure.

# 5. Cross-Cutting Mechanisms (design-level)

| Mechanism | Design |
|---|---|
| **Posting choke point** | `PostingService.post(journalDraft, tx)` — validates balance/period/account rules (FR-ACC-001.1), allocates numbers via `NumberingService` row-locked allocator (NFR-INT-003), writes journal + lines. DB trigger rejects `gl_*` writes from any other code path (defense in depth). |
| **Transactions** | `tx(async em => {...})` helper wraps TypeORM `EntityManager`; services compose repositories + posting inside one transaction; REPEATABLE READ default, row locks (`SELECT … FOR UPDATE`) on wallet/session/numbering hot rows. |
| **Domain events + outbox** | Events written to `outbox` table inside the business transaction; post-commit dispatcher (worker) delivers to in-process handlers and BullMQ — at-least-once, ordered per aggregate; handlers idempotent. |
| **Audit** | Interceptor + subscriber pair capture mutations with before/after diffs into hash-chained `audit_log` (FR-AUD-001/002); payroll amounts envelope-encrypted within entries (FR-PYRL-012.1). |
| **RBAC** | `@RequirePermission('billing:invoice:void')` decorator → guard → permission cache (Redis, busted on role change via `perms_hash` claim). Authority limits & SoD checks in a shared `AuthorityService`. |
| **Validation** | DTO (class-validator) at edge; zod mirrors in `contracts` for frontend; domain invariants in services; CHECK/FK/UNIQUE at DB (G-04 three layers). |
| **Approval engine** | Generic `ApprovalInstance` attached by domain code; engine owns transitions; domains verify `approval_ref` before posting (FR-APPR-007.1). |
| **Error model** | Exception filter maps domain exceptions → error envelope (`FR-API-005.1` codes); `request_id` from Nginx correlates logs end-to-end (NFR-MNT-005). |
| **i18n** | Backend messages via message keys; frontend ICU catalogs `en/sw/fr`; pseudo-locale CI build (NFR-USE-003). |

---

*Continue to KFE-ARC-002 (Communication & Authentication) and KFE-ARC-003 (Deployment & Infrastructure).*

# KLICKIT FINANCE ERP — Phase 5

## Backend Module Plan: The 21 Modules & Build Order

| Field | Value |
|---|---|
| **Document ID** | KFE-BE-000 |
| **Version** | 1.0 |
| **Date** | 15 July 2026 |
| **Traces to** | KFE-ARC-001 §3.3 (module map), KFE-DB-001 §2 (naming/prefix conventions), KFE-DB-001 §7.2 (migration inventory) |

---

# 1. How the 21 modules were derived

`docs/phase-4/01-standards-and-migrations.md` §2 enumerates exactly 20 module table-prefixes (`usr set brnd file comm appr gl std bill pay wall proc inv exp pyrl bank fa rpt intg bkp`, excluding `obx_` which is shared-kernel infrastructure, not a bounded module) plus the structurally isolated `license.*` schema — **21 build units**, each becoming one Nest module delivered per `docs/phase-4/04-schema-operations.md`'s module-anatomy standard (module, DTOs, controllers, services, repositories, entities, guards, validation, Swagger, unit + integration tests).

`auth` has no dedicated table prefix (its tables — `usr_session`, `usr_login_event`, `usr_api_key` — live under `usr_`), so it is delivered bundled into Module 1 alongside `users`, matching the phase-gate text in `docs/phase-4/04-schema-operations.md:339`. The executive **Dashboard** (required by the project brief) has no table prefix of its own either — it is a read-only aggregation over the `mv_*` materialized views and the `reporting-engine`'s CQRS-lite read side, so it is delivered as part of Module 18 (`rpt`).

# 2. The 21 modules, in dependency order

| # | Module | Prefix(es) | Layer | Depends on | Delivers |
|---|---|---|---|---|---|
| 1 | **Shared Kernel + Auth/Users/RBAC** | `usr_` (+ `audit.*`, `obx_outbox`) | Platform | — (foundation) | Money/ids/exceptions/pagination/database/events/audit/rbac libs; login, 2FA, sessions, refresh rotation, OTP, API keys; users, roles, permissions, departments, SoD |
| 2 | **Settings** | `set_` | Platform | 1 | Academic years/terms, numbering series (gapless allocator), integration config, custom field defs |
| 3 | **Files** | `file_` | Platform | 1 | MinIO-backed object storage, upload/signed-URL service |
| 4 | **Branding** | `brnd_` | Platform | 1, 3 (files) | Theme tokens, login/document config, publish workflow |
| 5 | **Communications** | `comm_` | Platform | 1, 2, 4 | Templates, trigger bindings, broadcast/message log, device tokens, `SmsPort`/`MailPort`/`PushPort` adapters |
| 6 | **Approvals** | `appr_` | Platform | 1 | Generic workflow engine: definitions, versions, levels, routing rules, instances, actions |
| 7 | **Accounting Core** | `gl_` | Core | 1, 2 | Chart of Accounts, fiscal years/periods, journals (+ balanced-journal trigger), `PostingService` (sole GL writer), cost centers, budgets, `NumberingService` |
| 8 | **Students** | `std_` | Domain | 1, 2, 6 | Student master, guardians, linked-parent accounts (fills the Module 1 OTP-login stub) |
| 9 | **Billing** | `bill_` | Domain | 2, 6, 7, 8 | Fee categories/structures, invoices (bulk + recurring), concessions, waivers, sponsors, credit/debit notes |
| 10 | **Payments** | `pay_` | Domain | 2, 6, 7, 9 | Receipts, cashier sessions, cheques, M-Pesa (STK/C2B/B2C via `MpesaPort`), suspense |
| 11 | **Wallet** | `wall_` | Domain | 7, 10 | Wallet balances, transactions, service points, top-up/spend/lock/freeze |
| 12 | **Procurement** | `proc_` | Domain | 2, 6, 7 | Suppliers, requisitions, POs, quotation comparison, GRNs, supplier payments |
| 13 | **Inventory** | `inv_` | Domain | 12 | Items, stores, stock movements/balances, stock takes, barcode/QR |
| 14 | **Expenses** | `exp_` | Domain | 6, 7 | Expense categories, petty cash, claims, recurring expenses, budget tracking |
| 15 | **Payroll** | `pyrl_` | Domain | 6, 7 | Employees, salary structures, PAYE/NSSF/SHIF/AHL, loans, payroll runs, payslips |
| 16 | **Banking** | `bank_` | Domain | 7, 10, 15 | Bank/cash accounts, transfers, deposits, reconciliation, statement import (`BankStatementPort`) |
| 17 | **Fixed Assets** | `fa_` | Domain | 7, 12 | Asset register, depreciation, maintenance, transfers, disposals |
| 18 | **Reporting Engine + Dashboard** | `rpt_` (+ `mv_*`) | Platform | all above | Report definitions/schedules, all ledger/financial/statutory reports, executive dashboard KPIs off `mv_*` |
| 19 | **Integrations** | `intg_` | Platform | 7, 18 | Webhook delivery, `AccountingSyncPort` (QuickBooks/Xero/Sage) |
| 20 | **Backups/Ops** | `bkp_` | Platform | 1 | Backup runs, restore verification, `/ops` health surface |
| 21 | **Licensing** | `license.*` | Isolated | shared kernel ONLY | Own schema+role; Super Admin mutual-auth API; usage snapshots, update notices — no import from/to any other module (CI-enforced) |

# 3. Execution rule for this phase

Per project instruction, all 21 modules are built continuously without a per-module approval gate — only Phase 5 → Phase 6 is a gate.

**Correction (2026-07-16)**: the original draft listed Branding (module 3) before Files (module 4). `brnd_theme.logo_file_id`/`favicon_file_id` are FKs to `file_object`, so the referenced table must exist first — Files and Branding were swapped (Files is now module 3, Branding module 4) before either was built. Each module still ships complete (entities, DTOs, controllers, services, repositories, guards, validation, Swagger, unit + integration tests) before moving to the next, and migrations are added in the same numeric ranges specified in `docs/phase-4/01-standards-and-migrations.md` §7.2.

---

*Module-by-module delivery follows below as it is built; this document is the fixed reference for order and scope.*

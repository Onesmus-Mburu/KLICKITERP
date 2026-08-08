# KLICKIT FINANCE ERP — Phase 4

## Database Design (Part 1 of 4): Standards, Naming Conventions, Normalization & Migration Strategy

| Field | Value |
|---|---|
| **Document ID** | KFE-DB-001 |
| **Version** | 1.0 |
| **Date** | 14 July 2026 |
| **Traces to** | KFE-ARC-001/002/003 (approved); KFE-FRD-001 entity models; DR-001…008 |
| **Engine** | PostgreSQL 16 · TypeORM · single DB per school (ADR-002) |
| **Companions** | KFE-DB-002 (Platform+Accounting), KFE-DB-003 (Student Finance), KFE-DB-004 (Operations) |

---

# 1. Schema Organization

| Schema | Contents | DB roles with access |
|---|---|---|
| `app` (default) | All application tables (~110), module-prefixed | `kfe_app` (DML only), `kfe_migrate` (DDL) |
| `license` | Licensing tables ONLY (FR-LIC-004, ADR-002) | `kfe_license` (DML on this schema only), `kfe_migrate` |
| `audit` | `audit_log` + hash-chain anchors — INSERT-only for app roles | `kfe_app` (INSERT/SELECT; UPDATE/DELETE revoked), `kfe_migrate` |

Runtime enforcement: `kfe_app` has **no** DDL, no superuser, no access to `license.*`; `kfe_license` cannot read `app.*`. GL tables additionally protected by trigger `trg_gl_writer_guard` rejecting writes when `application_name ≠ 'kfe-posting-service'` (defense-in-depth for the posting choke point).

# 2. Naming Conventions

| Object | Convention | Example |
|---|---|---|
| Tables | `snake_case`, singular, module prefix | `bill_invoice`, `pay_receipt`, `gl_journal_line` |
| Module prefixes | `usr_ set_ brnd_ file_ comm_ appr_ gl_ std_ bill_ pay_ wall_ proc_ inv_ exp_ pyrl_ bank_ fa_ rpt_ intg_ bkp_ obx_` | — |
| Primary key | `id UUID` (UUIDv7, app-generated — time-ordered for index locality) | `id` |
| Foreign key column | `<referenced_entity>_id`; role-qualified when repeated | `student_id`, `approved_by_user_id` |
| Business identifiers | `number` (documents), `code` (masters) — never the PK | `bill_invoice.number` |
| Money | `NUMERIC(18,4)`, suffix `_amount` / conventional names (`total`, `balance`) | `paid_amount` |
| Quantities | `NUMERIC(14,4)` suffix `_qty` | `received_qty` |
| Timestamps | `timestamptz`, suffix `_at`; business dates `date` suffix `_date` or `_on` | `posted_at`, `due_date` |
| Booleans | `is_` / `has_` / `allows_` prefix | `is_active` |
| Enums | `varchar(30)` + named CHECK constraint (not PG enums — additive changes without table rewrite) | `status` + `ck_bill_invoice_status` |
| Index | `ix_<table>_<cols>`; unique `uq_`; partial noted `_p` | `ix_pay_receipt_student_id` |
| Constraints | `pk_`, `fk_<table>_<ref>`, `ck_`, `uq_` | `fk_bill_invoice_student` |
| Triggers / functions | `trg_` / `fn_` | `trg_gl_journal_balanced` |
| Materialized views | `mv_` | `mv_daily_collections` |
| Standard columns (every table) | `created_at`, `updated_at`, `created_by`, `updated_by` (DR-007); mutable business tables add `version int` (optimistic lock) | — |

TypeORM `SnakeNamingStrategy` + prefix map generates all of this from entities; conventions are therefore self-enforcing in code.

# 3. Data Type Standards

| Concern | Type | Rule |
|---|---|---|
| Money | `NUMERIC(18,4)` | Never float; arithmetic in app via Money lib; DB SUM() allowed for verification queries |
| IDs | `uuid` | UUIDv7 from shared kernel |
| Short text | `varchar(n)` sized per field | names 120, codes 30, phones 20 (E.164), emails 160 |
| Long text | `text` | narrations, reasons |
| Structured flexible data | `jsonb` | custom fields, raw payloads, denomination counts, template variables — never for queryable financial figures |
| Phone numbers | `varchar(20)` normalized E.164 (`+2547…`) at app layer | uniqueness on normalized form |
| Percentages/rates | `NUMERIC(9,6)` | e.g., PAYE band rate 0.300000 |
| Hashes | `varchar(64)` hex / `bytea` | SHA-256 |

# 4. Normalization Analysis

Baseline: **3NF/BCNF everywhere**. Verified per table group in DB-002…004 (each master/detail split, no repeating groups, no partial or transitive dependencies; e.g., invoice pricing lives on `bill_invoice_line` not the invoice; supplier payment terms on `proc_supplier` not on POs — POs snapshot terms at issue as deliberate temporal copies, see below).

**Deliberate, documented denormalizations** (each with its integrity guard):

| # | Denormalization | Reason | Guard |
|---|---|---|---|
| N-1 | `bill_invoice.paid_amount`, `balance` (derivable from allocations) | Counter screens & defaulter queries at scale (D6) | Updated only inside allocation transactions; invariant sweep re-derives and compares hourly (NFR-INT-002) |
| N-2 | `wall_wallet.balance` + `wall_transaction.balance_after` | O(1) balance check under row lock; audit-visible running balance (FR-WALL-001) | Balance updated in same locked transaction as the txn row; CHECK `balance >= -overdraft_limit`; sweep vs Σ transactions |
| N-3 | `inv_stock_balance` (per item×store) | Negative-stock CHECK + fast availability | Movements and balance updated atomically; sweep vs Σ movements |
| N-4 | Document **temporal snapshots**: PO price/terms, invoice line amounts, payroll run figures, structure version references | Immutability (BR-GEN-03) — masters change, documents must not | Snapshot columns written once at posting; no UPDATE path exists |
| N-5 | `mv_*` dashboard/report materialized views | NFR-PERF-003 | Refreshed from source; never written by app code |
| N-6 | `gl_account.current_balance` **not stored** — computed | Avoid the classic drift bug | Period-total table `gl_period_account_total` maintained by posting service instead (append-consistent), verified by sweep |

# 5. Constraint Standards (applied throughout DB-002…004)

1. **Every FK is a real FK** with explicit `ON DELETE` behavior: `RESTRICT` default (financial history must block master deletion), `CASCADE` only master→detail within one document, `SET NULL` never on financial rows.
2. **Status CHECKs** enumerate the state machine's states; illegal transitions blocked at service layer, illegal states at DB.
3. **Financial CHECKs**: non-negative where absolute (`amount > 0` on splits/lines), signed where directional; wallet floor; stock floor; installments `Σ = invoice balance` verified by deferred trigger.
4. **Balanced-journal trigger**: `trg_gl_journal_balanced` (CONSTRAINT trigger, DEFERRABLE INITIALLY DEFERRED) asserts Σdebit = Σcredit per journal at COMMIT (BR-GEN-02 at DB layer).
5. **Immutability triggers** on posted documents: `trg_<table>_immutable` rejects UPDATE of financial columns when `status ∈ (POSTED, COMMITTED…)` except whitelisted transitions (e.g., `paid_amount`, `status` via allocation path).
6. **Gapless numbering**: `set_numbering_series.next_no` allocated via `SELECT … FOR UPDATE` inside the posting transaction (NFR-INT-003); `uq_<table>_number` per series.
7. **Idempotency**: `uq` on `idempotency_key` columns (receipts, wallet txns, M-Pesa ref, outbox consumer marks).
8. **Partial unique indexes** for "one active X" rules, e.g., one OPEN cashier session per cashier: `uq_pay_session_open_p ON pay_cashier_session(cashier_id) WHERE status='OPEN'`.

# 6. Indexing Strategy

Principles: index every FK used in joins (PG doesn't auto-index FKs); composite indexes ordered by (equality → range) matching the access paths catalogued in FRD; partial indexes for hot subsets (open invoices, unreconciled lines, pending approvals); `pg_trgm` GIN for name search; BRIN for huge append-only tables' time axes.

| Pattern | Applied to |
|---|---|
| `(student_id, posted_at)` composites | ledger entries, receipts, wallet txns — statement rendering |
| Partial: `WHERE status='...'` hot states | open invoices, OPEN suspense, PENDING approvals, unreconciled statement lines, unpublished outbox |
| GIN trigram on `(names, admission_no)` | `std_student` — FR-PAY-002 ≤2 s search |
| GIN trigram on supplier/employee names | `proc_supplier`, `pyrl_employee` |
| BRIN `(posted_at)` | `gl_journal_line`, `audit.audit_log`, `comm_message` (multi-year append-only) |
| Covering (`INCLUDE`) | defaulter query: `ix_bill_invoice_open_p (due_date) INCLUDE (student_id, balance) WHERE balance > 0` |
| Hash-friendly uniques | `mpesa_ref`, `idempotency_key`, API key hash |

Every index in DB-002…004 cites the query it serves. Index bloat review is part of the ops runbook (REINDEX guidance).

# 7. Migration Strategy

## 7.1 Rules

| # | Rule |
|---|---|
| M-1 | TypeORM migrations only; **no `synchronize`** in any environment; generated SQL reviewed by hand before merge (NFR-MNT-004) |
| M-2 | One migration = one logical change; file name `<timestamp>-<verb>-<subject>.ts`; every migration implements a real `down()` (reversible), or documents irreversibility in-file with a data-preservation note (rare, requires review sign-off) |
| M-3 | Three streams, ordered: **schema** migrations → **seed** migrations (CoA template, roles/permissions, default templates, Infoney theme, statutory rate tables with effective dates) → **data-fix** migrations (versioned corrections). Seeds are idempotent (upsert by natural key) |
| M-4 | CI gate on every PR: fresh DB → `migration:run` (all) → `migration:revert` (last) → `migration:run` → schema-diff against entities must be empty |
| M-5 | Migrations run under `kfe_migrate` role by the upgrade script only — never at app boot (NFR-SEC-009); app boot verifies "migrations current" and refuses to start on mismatch |
| M-6 | Production upgrades: pre-update backup (blocking, verified) → migrations inside a transaction where PG allows (DDL is transactional) → non-transactional steps (index builds `CONCURRENTLY`, backfills) run as staged pre/post steps with checkpoints |
| M-7 | Expand–migrate–contract for breaking changes across versions: v(n) adds new structures + dual-writes, v(n+1) removes old — enabling rollback within one release window |
| M-8 | Large-table changes (>1M rows): batched backfills via worker job with progress + resume, never a single locking UPDATE |
| M-9 | Baseline policy: at each major release, a "squashed baseline" is generated for fresh installs; existing instances continue on the incremental chain — both paths CI-verified to produce identical schemas (hash compare of `pg_dump --schema-only`) |
| M-10 | Statutory rate updates (PAYE/NSSF/SHIF/AHL) ship as seed migrations adding new effective-dated rows — never mutating history (BR-PYRL-01) |

## 7.2 Migration 0001 inventory (initial schema)

The initial chain (built module-by-module in Phase 5, in dependency order):

```
0001 extensions            pgcrypto, pg_trgm, btree_gin
0002 schemas & roles       app/license/audit schemas; kfe_app/kfe_license/kfe_migrate
0003 shared               obx_outbox, file_object
0010 usr_*                 users, roles, permissions, sessions, sod, api keys
0020 audit                audit_log (+chain anchor, insert-only grants)
0030 set_* brnd_*          settings, years/terms, numbering, integrations, themes
0040 gl_*                  accounts, fiscal, periods, journals(+triggers), cost centers, budgets
0050 std_* bill_*          students, guardians, structures, invoices, concessions, sponsors
0060 pay_*                 receipts, sessions, cheques, mpesa, suspense
0070 wall_*                wallets, transactions, service points
0080 proc_* inv_*          suppliers→vouchers; items→stock takes
0090 exp_* pyrl_*          expenses, petty cash; payroll chain
0100 bank_* fa_*           banking, reconciliation; assets
0110 comm_* appr_* rpt_*   templates, messages; workflows; report schedules
0120 intg_* bkp_*          webhooks, sync logs; backup runs
0130 license.*             license, call log, usage, update notices
0140 mv_*                  materialized views + refresh functions
0900 seeds                 permissions catalogue, system roles, CoA template,
                           default workflows, notification templates, Infoney theme,
                           statutory tables (2026 effective rates), demo fixtures (dev only)
```

# 8. Data Lifecycle

- **Retention** (DR-005): enforced by nothing being deleted; archival = partition-ready design on the four biggest tables (`gl_journal_line`, `audit_log`, `comm_message`, `wall_transaction` — declarative range partitioning by year activated at the 2M-row watermark, migration-scripted).
- **PII handling** (CR-001): PII columns tagged in a maintained `docs/data-dictionary` classification; subject-access export function assembles per-guardian data; log scrubber redacts phone/email patterns.
- **Backups/restore**: per KFE-ARC-003 §6; `pg_dump -Fc` custom format; restore drill asserts row counts + invariant sweep green.

---

*Table-by-table specifications follow in DB-002 (platform + accounting), DB-003 (student finance), DB-004 (operations + licensing).*

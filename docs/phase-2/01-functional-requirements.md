# KLICKIT FINANCE ERP — Phase 2

## Detailed Functional Requirements Decomposition

| Field | Value |
|---|---|
| **Document ID** | KFE-FRD-001 |
| **Version** | 1.0 |
| **Date** | 14 July 2026 |
| **Traces to** | KFE-SRS-001 v1.0 (approved) |
| **Approved decisions applied** | Base currency = **KES** (SRS FR-ACC-013 remains P3 for foreign-currency transactions) |

This document decomposes every SRS functional requirement into implementable detail: entities and fields, validation rules, processing logic, state machines, and general-ledger posting schemes. Sub-requirements use the SRS ID plus a suffix (e.g., `FR-PAY-008.3`). Business rules referenced as `BR-*` are defined in `03-business-rules.md`.

---

## Global Conventions (apply to every module)

| Ref | Convention |
|---|---|
| G-01 | All money fields: KES, `NUMERIC(18,4)` storage, 2-dp display, half-up rounding at line level; document total = Σ rounded lines (BR-GEN-05). |
| G-02 | Every document type has a status state machine; only `POSTED`/final states create GL entries; all transitions audit-logged. |
| G-03 | Every list endpoint/screen: server-side pagination, sorting, filtering, and export respecting RBAC scope. |
| G-04 | Every create/update passes DTO validation (class-validator) + domain validation (service layer) + DB constraints — three layers, consistent messages. |
| G-05 | Idempotency keys mandatory on: payment creation, wallet debit/credit, M-Pesa callbacks, webhook deliveries. |
| G-06 | "Approval-gated" = document enters the APPR engine per configured chain before it may reach `APPROVED`; zero financial effect before final approval (FR-APPR-007). |
| G-07 | All document numbers issued transactionally from gapless per-series sequences at posting time (not at draft creation) — drafts carry provisional refs (BR-GEN-07). |

### Master GL Posting Map (normative)

Every financial event posts exactly as below (accounts resolved from CoA mappings in Settings):

| # | Event | Debit | Credit |
|---|---|---|---|
| P-01 | Invoice issued | AR–Student control | Fee income (per category line) |
| P-02 | Discount/waiver posted | Concessions (contra-income, per scheme) | AR–Student control |
| P-03 | Scholarship/bursary applied (sponsor-billed) | AR–Sponsor | AR–Student control |
| P-04 | Scholarship/bursary applied (school-funded) | Bursary expense/contra-income | AR–Student control |
| P-05 | Late fee/interest applied | AR–Student control | Late fee income |
| P-06 | Credit note | Fee income (original lines) | AR–Student control |
| P-07 | Debit note | AR–Student control | Income per line |
| P-08 | Fee payment received | Cash/Bank/M-Pesa clearing (per method) | AR–Student control |
| P-09 | Advance payment (no open invoice) | Cash/Bank/M-Pesa clearing | Student prepayments (liability) |
| P-10 | Prepayment applied to invoice | Student prepayments | AR–Student control |
| P-11 | Cheque bounced | AR–Student control (+P-05 if bounce fee) | Bank (uncleared cheques) |
| P-12 | Credit-balance refund paid | Student prepayments / AR credit | Cash/Bank |
| P-13 | Wallet top-up | Cash/Bank/M-Pesa clearing | Wallet liability control |
| P-14 | Wallet spend at service point | Wallet liability control | Service-point income (+COGS pair if stock item: Dr COGS / Cr Inventory) |
| P-15 | Wallet → fees transfer | Wallet liability control | AR–Student control |
| P-16 | Wallet refund | Wallet liability control | Cash/Bank |
| P-17 | Wallet-to-wallet transfer | Wallet liability (sender sub-acct) | Wallet liability (receiver sub-acct) — control net zero |
| P-18 | GRN (stock items) | Inventory | GRN accrual |
| P-19 | GRN (direct expense/asset items) | Expense / Asset WIP | GRN accrual |
| P-20 | Supplier invoice matched | GRN accrual (+/- variance to price-variance acct) | AP–Supplier control |
| P-21 | Supplier payment | AP–Supplier control | Bank/Cash/M-Pesa |
| P-22 | Stock issue to department | Department expense | Inventory |
| P-23 | Stock sale (uniform/book) | Cash/Wallet/AR–Student | Sales income; plus Dr COGS / Cr Inventory |
| P-24 | Stock adjustment (loss) | Stock loss expense | Inventory |
| P-25 | Direct expense paid | Expense (category) | Cash/Bank/Petty cash |
| P-26 | Petty cash replenishment | Petty cash float | Bank |
| P-27 | Payroll commit | Payroll expense (gross, by cost center) + Employer contrib. expense | PAYE, NSSF, SHIF, AHL, loan recovery, other deduction payables; Net pay payable |
| P-28 | Net pay disbursed | Net pay payable | Bank |
| P-29 | Statutory remittance | Statutory payable (each) | Bank |
| P-30 | Depreciation run | Depreciation expense | Accumulated depreciation |
| P-31 | Asset disposal | Cash/AR + Accum. depreciation + Loss on disposal | Asset cost + Gain on disposal |
| P-32 | Bank transfer between accounts | Destination bank/cash | Source bank/cash (via transfer clearing) |
| P-33 | Bank charges (reconciliation) | Bank charges expense | Bank |
| P-34 | M-Pesa settlement to bank | Bank | M-Pesa clearing |

---

## M1. Authentication, Users & Audit (AUTH/USER/AUD)

### Entities

| Entity | Key fields |
|---|---|
| `User` | id, username, email, phone, password_hash, status(INVITED/ACTIVE/SUSPENDED/DEACTIVATED), must_change_password, twofa_enabled, twofa_secret(enc), last_login_at, department_id, authority_limit_kes |
| `Role` | id, name, is_system_template, description |
| `Permission` | code (`module:resource:action`), description |
| `UserRole`, `RolePermission` | join tables |
| `Session` | id, user_id, refresh_token_hash, device, ip, user_agent, created_at, last_seen_at, revoked_at |
| `LoginEvent` | user_id?, username_attempted, success, failure_reason, ip, device_fp, at |
| `AuditLog` | id, actor_id, entity_type, entity_id, action, before(jsonb), after(jsonb), ip, session_id, at, prev_hash, hash |

### Detailed requirements (selected decompositions)

- **FR-AUTH-001.1** Login: `POST /auth/login` {identifier, password} → on success (and 2FA if enabled → `POST /auth/2fa/verify` {code}) returns access JWT (TTL 15 min, configurable 5–60) + refresh token (TTL 7 d, configurable 1–30) as httpOnly secure cookie for the web app; bearer for API clients.
- **FR-AUTH-001.2** JWT claims: `sub`, `roles[]`, `perms_hash` (permission-set version — forces refetch on role change), `sid` (session id), `typ`.
- **FR-AUTH-002.1** Refresh rotation: presenting a used refresh token revokes the whole session family and raises a security notification to the user.
- **FR-AUTH-004.1** 2FA enrollment: QR (otpauth URI) + manual key; verify one code to activate; policy matrix per role: `OFF / OPTIONAL / REQUIRED`. Default REQUIRED for System Admin, Bursar, Accountant, Payroll Officer.
- **FR-AUTH-007.1** Lockout: 5 fails/15 min window → lock 15 min (both configurable); System Admin unlock writes audit entry; lockout events notify the user via email/SMS.
- **FR-AUTH-013.1** Parent OTP login: phone → 6-digit OTP, TTL 5 min, max 3 sends/hour and 5 verifies/OTP; OTPs hashed at rest.
- **FR-USER-001.1** Permission catalogue is code-generated from module decorators at build time and seeded by migration — UI can never reference a nonexistent permission.
- **FR-USER-005.1** Authority limits: `authority_limit_kes` checked on receipt capture, payment vouchers, waiver initiation, and approval steps; exceeding limit blocks with named-supervisor override option (override itself audit-logged, dual-credential).
- **FR-USER-009.1** SoD matrix (Settings › Security): pairs of permission codes declared mutually exclusive per user (defaults ship enabled: `payments:voucher:create` × `payments:voucher:approve`; `payroll:run:execute` × `payroll:run:approve`; `billing:waiver:create` × `billing:waiver:approve`). Role assignment violating an enabled pair is rejected with the conflicting pair named.
- **FR-AUD-002.1** Hash chain: `hash = SHA-256(prev_hash ‖ canonical_json(entry))`; nightly integrity job re-verifies chain segments and alerts on breaks (NFR-INT-002 job).

---

## M2. Dashboard (DASH)

- **FR-DASH-002.1** KPI definitions (all from GL/materialized views, BR-RPT-01):
  - *Today's Collection* = Σ receipts posted today (all methods, excluding reversals) — cash-basis.
  - *Outstanding Fees* = AR–Student control balance (dr) − unallocated credits.
  - *Collection Rate* = period receipts ÷ (period opening AR + period net billings), shown per term.
  - *Cash Flow* = Σ (bank+cash+M-Pesa clearing) movements in/out for the selected period.
  - *Revenue / Expenses / Surplus* = income-statement accounts for the period (accrual).
- **FR-DASH-006.1** Charts: Collection Trend (bar/line, day|week|month|term buckets); Income vs Expense (grouped bars per month); each with CSV export and click-through → pre-filtered report.
- **FR-DASH-009.1** Realtime: server emits `dashboard.kpi.updated` over WebSocket on receipt/invoice/expense posting (debounced 5 s); client falls back to 60 s polling if the socket drops.
- **FR-DASH-010.1** Materialized views `mv_daily_collections`, `mv_ar_summary`, `mv_income_expense` refreshed transactionally-consistent every 60 s and on demand; every figure reconciles to RPT equivalents.

---

## M3. Student Billing (BILL)

### Entities

| Entity | Key fields |
|---|---|
| `Student` | id, admission_no (unique), names, class_id, stream_id, status, boarding(DAY/BOARDER), fee_group_id, sponsor_id?, transport_route_id?, custom_fields(jsonb) |
| `Guardian` | id, names, phone (unique per school), email?, national_id?, relationship; `StudentGuardian` (primary flag, billing flag) |
| `FeeCategory` | id, name, gl_income_account_id, taxable, active |
| `FeeStructure` | id, academic_year_id, term_id, class_id, stream_id?, boarding?, fee_group_id?, version, status(DRAFT/PUBLISHED/SUPERSEDED), lines[{fee_category_id, amount, optional?}] |
| `Invoice` | id, number, student_id, term_id, issue_date, due_date, status, lines[], subtotal, concession_total, total, paid, balance, source(STRUCTURE/ADHOC/RECURRING/DEBIT_NOTE) |
| `InstallmentPlan` | invoice_id/student_id, schedule[{seq, due_date, amount, settled}] |
| `Concession` | id, type(WAIVER/DISCOUNT/SCHOLARSHIP/BURSARY), student_id, scheme_id?, sponsor_id?, target(invoice/line), amount|percent, status, approval_ref |
| `CreditNote` / `DebitNote` | number, invoice_ref/student_ref, lines, reason, status, approval_ref |
| `StudentLedgerEntry` | student_id, at, doc_type, doc_ref, debit, credit, running_balance (maintained view of sub-ledger) |

### Invoice state machine

`DRAFT → PENDING_APPROVAL? → APPROVED → POSTED → (PARTIALLY_PAID → PAID) | VOID`
- POSTED assigns the gapless number and fires P-01 (+P-02..P-04 for structure-applied concessions).
- VOID only if `paid = 0` (else credit note path, BR-BILL-09); fires reversal of P-01.

### Selected decompositions

- **FR-BILL-002.1** Import pipeline: upload → parse → column-mapping UI (saved templates) → validation report per row (duplicate admission_no, unknown class, bad phone) → commit valid rows / export rejects. Re-import with same batch key updates instead of duplicating.
- **FR-BILL-011.1** Structure resolution order for a student: (year, term, class) + most specific match on stream > boarding > fee_group; optional lines included only if assigned to the student (FR-BILL-013).
- **FR-BILL-020.1** Bulk billing wizard: select scope (term + classes/streams/groups) → preview grid (per-student computed invoice, exceptions flagged: no structure, inactive student, already billed) → confirm → BullMQ job `billing.bulk` (chunked 100/batch, per-student transaction) → completion report (created / skipped-already-billed / failed + reasons). Re-running the same scope is idempotent per (student, term, structure version) (BR-BILL-04).
- **FR-BILL-025.1** Installments: plan total must equal invoice balance at creation; editing an active plan requires `billing:installment:update`; reminders fire per installment due date (FR-BILL-064 cadence).
- **FR-BILL-026.1** Late-fee engine (nightly job): for each overdue invoice/installment where policy active and student not exempt → compute flat|%|tiered charge → aggregate into a dated late-fee debit line (P-05) — but if `require_approval=true` in policy, stage as a draft batch for Bursar approval before posting.
- **FR-BILL-042.1** Sponsor module: sponsor registry (contacts, agreement docs); award = (student, term, amount|%, categories covered); on invoice posting, covered amounts auto-move to sponsor via P-03; sponsor statement shows awards vs sponsor payments; sponsor payments received post Dr Bank / Cr AR–Sponsor.
- **FR-BILL-052.1** Refund voucher: source = student credit balance only (never negative AR); method cash|bank|M-Pesa B2C; approval chain `REFUNDS`; on execution fires P-12 + payout (B2C result callback finalizes or reverts to `APPROVED_UNPAID`).
- **FR-BILL-062.1** Defaulters register columns: student, class, guardian phone, total due, overdue amount, days overdue (oldest unpaid due date), last payment date/amount; bulk actions: send reminder (respecting FR-COMM-008), export, print class lists.

---

## M4. Fee Collection & Receipting (PAY)

### Entities

`Receipt` (number, student_id, payer info, date, lines[allocations], method_splits[{method, amount, ref, bank_account_id?}], cashier_id, session_id, status(POSTED/REVERSED), reversal_ref?), `CashierSession` (cashier, till, opened_at, float, closed_at, counted{denominations}, variance, supervisor_id, status), `MpesaTransaction` (type(STK/C2B/B2C), shortcode, msisdn(masked), amount, mpesa_ref unique, raw payload, state, matched_receipt_id?), `SuspenseItem` (source, amount, ref, reason, state(OPEN/MATCHED/REFUNDED)).

### Receipt processing (FR-PAY-001..012)

1. Lookup student (adm no / name / guardian phone; ≤2 s — indexed trigram search).
2. Capture splits: Σ splits = receipt total; each method validates its refs (cheque → bank+number+date; bank → slip ref + bank account; card/POS → terminal ref; M-Pesa manual → mpesa ref checked unique; wallet → wallet balance sufficient).
3. Allocation: default rule from Settings (`OLDEST_FIRST` | category priority list); UI shows resulting allocation, editable if `payments:allocation:override` (audit-logged). Surplus → prepayment (P-09).
4. Post transactionally: receipt number issued, student ledger + GL (P-08/P-09), wallet debit if wallet method, cashier session totals updated.
5. Outputs: thermal/A4 print, PDF to email, SMS summary + verify link (QR = `RCT|number|amount|hash`), push. Delivery via COMM queues — receipt posting never blocks on delivery.

- **FR-PAY-007.1** Cheque lifecycle: `UNCLEARED → CLEARED | BOUNCED`; receipts containing uncleared cheque splits show a "subject to clearance" banner on printed receipts; BOUNCE → auto reversal receipt (P-11), optional bounce fee per policy, guardian SMS/email, defaulter flag.
- **FR-PAY-008.1** STK flow: initiate (amount, msisdn, account_ref=admission_no) → store `CheckoutRequestID` → callback validates signature/source IP → success: create receipt automatically (idempotent on mpesa_ref) → notify cashier screen via WebSocket; timeout 90 s → status-query fallback job at +2 min before marking FAILED.
- **FR-PAY-009.1** C2B auto-match: parse `BillRefNumber` against admission_no patterns (configurable regex list, e.g., strip spaces/prefix); match → auto receipt; no match → SuspenseItem + daily suspense digest to Bursar; manual match screen posts receipt retroactively with original M-Pesa timestamp noted.
- **FR-PAY-011.1** Session close: system total per method vs counted; variance beyond tolerance (Settings, default KES 0) requires supervisor credential + reason; session report printable; cash banked via BANK deposit doc referencing session.
- **FR-PAY-012.1** Receipt reversal: reason codes (ERROR, BOUNCE, DUPLICATE, FRAUD), approval chain `PAYMENT_REVERSALS`, generates contra receipt `RVS-…`, restores invoice balances, reverses GL; original and reversal cross-reference each other.

---

## M5. Student E-Wallet (WALL)

### Entities

`Wallet` (student_id unique, status(ACTIVE/LOCKED/FROZEN/CLOSED), daily_limit?, txn_limit?, category_blocks[], overdraft_limit=0), `WalletTransaction` (wallet_id, type(TOPUP/SPEND/TRANSFER_IN/TRANSFER_OUT/FEE_TRANSFER/REFUND/ADJUSTMENT), amount, balance_after, service_point_id?, items?, ref, idempotency_key unique, actor, at), `ServicePoint` (name, type(TRANSPORT/LIBRARY/SHOP/MEALS/PRINTING/TRIPS/ACTIVITIES/EMERGENCY/CUSTOM), gl_income_account_id, operators[], device_refs[]).

### Selected decompositions

- **FR-WALL-004.1** POS charge: identify (scan QR/barcode card | adm no | search) → amount or item pick (shop items from INV with price + stock decrement) → limit checks (status, daily, per-txn, category block, balance) → confirm → post (P-14) → operator sees new balance; guardian notification per preference. All checks server-side; response ≤2 s LAN.
- **FR-WALL-005.1** Balance check under concurrency: wallet debits serialize per wallet (row lock); balance can never go below −overdraft_limit (DB CHECK enforced too).
- **FR-WALL-009.1** Lock (debits blocked) vs Freeze (all blocked): settable by staff (`wallet:control`) and — lock only — by the guardian from the portal; auto-freeze on student status → WITHDRAWN pending clearance.
- **FR-WALL-010.1** Guardian controls (portal): daily limit ≤ school max, per-txn limit, category toggles; changes effective immediately, audit-logged, visible to staff.
- **FR-WALL-012.1** Reconciliation job (hourly): Σ wallet balances == wallet control GL balance; variance → CRITICAL alert + block manual wallet adjustments until resolved.
- **FR-WALL-013.1** Thresholds (Settings, defaults): refund > KES 0 → approval; transfer > KES 5,000 → approval; adjustment any amount → approval + reason codes.

---

## M6. Procurement (PROC)

Document chain and states:

```
Requisition DRAFT→SUBMITTED→APPROVED→(RFQ? QUOTES→AWARDED)→PO DRAFT→APPROVED→ISSUED
  →GRN (partial…) → Supplier Invoice (3-way match) → Payment Voucher APPROVED → PAID
```

- **FR-PROC-002.1** Requisition lines carry item (from INV master or free-text), qty, est. price, budget line; submission snapshots budget availability (EXP FR-EXP-007 check).
- **FR-PROC-004.1** PO: immutable once ISSUED; revision creates `PO-n Rev m` requiring re-approval, superseding prior print; PDF emailed to supplier with school branding.
- **FR-PROC-006.1** GRN: per-line received qty ≤ outstanding PO qty + tolerance % (Settings); rejects captured with reason → Return-to-Supplier note; stock lines post P-18 at PO price (variance settles at invoice match).
- **FR-PROC-007.1** 3-way match: invoice lines auto-match PO/GRN; tolerances (Settings: qty %, price %, absolute KES); within tolerance → auto-approve to AP (P-20); outside → exception queue with side-by-side comparison.
- **FR-PROC-008.1** Payment voucher: one or many supplier invoices, less credits; method bank/cheque/M-Pesa/cash; approval chain `SUPPLIER_PAYMENTS` (amount-tiered); on execution P-21 + remittance advice email.
- **FR-PROC-011.1** Rating: auto-metrics (on-time delivery % from PO vs GRN dates, rejection rate from GRNs) + manual 1–5 scores; composite shown in quotation comparison.

---

## M7. Inventory (INV)

- **FR-INV-001.1** Item master: code (auto/manual), name, category, UoM (+ conversions, e.g., carton→pieces), barcode/QR, type(STOCK/CONSUMABLE/SERVICE/RESALE), reorder level & qty, preferred suppliers, GL trio (asset, expense/COGS, income if resale), sale price (for RESALE), active flag.
- **FR-INV-003.1** Movement types: RECEIPT(GRN), ISSUE(department, requires `inventory:issue`), SALE(POS/billing), TRANSFER(2-step), ADJUSTMENT(count/write-off, approval-gated), RETURN. Each movement stores qty, unit cost (weighted-average at movement time), value, GL journal ref.
- **FR-INV-006.1** Weighted average recalculated on every receipt: `new_avg = (on_hand_value + receipt_value) / (on_hand_qty + receipt_qty)`; negative stock prohibited (DB constraint) — issue blocked with shortage message.
- **FR-INV-009.1** Stock-take: create session (store, scope) → freeze snapshot → count entry (scanner/manual/CSV) → variance report (qty & value) → approval `STOCK_ADJUSTMENTS` → post P-24/gain equivalents.
- **FR-INV-005.1** Uniform/book sale paths: (a) cash/M-Pesa sale at shop POS; (b) wallet sale (P-14+COGS); (c) bill-to-account → adds debit-note lines to student (P-07 + COGS pair). Receipts identical to PAY receipts with item detail.

---

## M8. Expenses (EXP)

- **FR-EXP-002.1** Expense voucher fields: payee (supplier/staff/other), category (→GL+budget line), amount, tax withheld?, method, attachments (≥1 required if amount > Settings threshold), narrative. Chain `EXPENSES` (amount-tiered). Posting P-25.
- **FR-EXP-003.1** Petty cash: float per custodian (established P-26); vouchers debit expense categories from float; replenishment request lists vouchers since last replenishment; approval → P-26 for the spent total; surprise-count screen records counted vs book with variance memo.
- **FR-EXP-007.1** Budget check at submission and again at approval: `available = budget − actuals − open commitments (approved reqs/POs/vouchers)`; policy per budget line: WARN or BLOCK (override permission `budget:override` + reason).

---

## M9. Payroll (PYRL)

### Computation pipeline (per run)

```
Gross = basic + allowances + overtime + one-off earnings
→ NSSF (tiered, effective-dated table)                    [employee + employer]
→ SHIF (rate % of gross, min amount, effective-dated)
→ AHL (rate % of gross, employee + employer)
→ Taxable = Gross − NSSF(employee) − SHIF − AHL(employee) [per prevailing KRA rules — relief/deductibility flags are table-driven and effective-dated]
→ PAYE = graduated bands(Taxable) − personal relief − insurance relief…
→ Net = Gross − PAYE − NSSF − SHIF − AHL − loans − advances − other deductions
```

All rates/bands/relief flags live in `StatutoryRateTable` rows (type, effective_from, params jsonb) — admin-editable, never hardcoded (FR-PYRL-003).

- **FR-PYRL-006.1** Run states: `DRAFT → COMPUTED → REVIEW (variance report vs prior run; flags > x% or > KES y) → PENDING_APPROVAL → APPROVED → COMMITTED (immutable, P-27) → PAID (P-28 per batch) → FILED`.
- **FR-PYRL-004.1** Loans: principal, rate (flat/reducing), term, schedule generated; per-run recovery auto-inserted; early settlement recalculates; statements per employee.
- **FR-PYRL-008.1** Payslip PDF: school branding, earnings/deductions detail, employer contributions, loan balances, YTD figures; delivered via emailed secure link (token, expiring) — no payslip attached directly to email by default.
- **FR-PYRL-009.1** Outputs per period: P10 CSV (iTax layout), NSSF return file, SHIF return file, AHL schedule, bank schedules grouped per employee bank, B2C batch file where configured.
- **FR-PYRL-012.1** Payroll data isolation: payroll tables readable only through payroll services; audit entries for payroll store amounts encrypted, visible only to payroll-permissioned auditors.

---

## M10. Banking (BANK)

- **FR-BANK-002.1** Documents: `Deposit` (source till/safe → bank, slip ref), `Withdrawal`, `Transfer` (two-leg with clearing account P-32, both legs in one transaction). Approval chains by amount tier.
- **FR-BANK-003.1** Statement import: per-bank saved mapping template (column → field, date format, debit/credit convention); staging table with dedupe on (account, date, amount, ref hash).
- **FR-BANK-004.1** Reconciliation workspace: unmatched statement lines vs unreconciled book entries; auto-match passes (exact ref → exact amount+date ±3 d → amount-only suggestions); one-click create adjustment (charges P-33, interest income); period lock on completion stores reconciliation statement snapshot (book balance ± outstanding items = bank balance). Reopening a locked reconciliation: `banking:reconciliation:reopen` + reason.
- **FR-BANK-005.1** Cheque register: books (bank account, prefix, leaf range), auto-next-leaf on voucher print; statuses ISSUED→PRESENTED→CLEARED / STOPPED / CANCELLED / STALE (auto-flag > 6 months).

---

## M11. Accounting (ACC)

- **FR-ACC-001.1** Posting service (single choke point): validates Σdebits=Σcredits (exact decimal), period open, accounts postable+active, control-account protection (FR-ACC-003) → writes `JournalHeader` + `JournalLine[]` immutably with source doc reference. **No module writes GL rows except through this service.**
- **FR-ACC-002.1** Default CoA shipped (seed migration): 5 root classes, school-oriented tree (~120 accounts) with the control accounts pre-mapped; account code format `X-XX-XXX` configurable at setup only.
- **FR-ACC-004.1** Manual journal: multi-line grid with account search, dims (cost center), memo per line, attachments; chain `JOURNALS`; reversal generates mirrored journal cross-referenced.
- **FR-ACC-007.1** Period model: fiscal year → 12 periods (or term-aligned periods, chosen at setup); states OPEN → SOFT_CLOSED (warn on post, `accounting:period:post-soft-closed` required) → HARD_CLOSED (posting impossible; reopen = `accounting:period:reopen` + approval + audit). Year-end close wizard: checklist (all reconciliations locked, suspense zero, depreciation run) → closing journal to Accumulated Fund → new-year opening balances auto-rolled.
- **FR-ACC-008.1** Statement drill path: statement line → account list → account ledger → journal → source document (receipt/invoice/voucher) in ≤4 clicks.
- **FR-ACC-009.1** Budget entity: fiscal year, account/cost-center grid with period phasing (equal/term-weighted/manual); versions (ORIGINAL, REVISED-n) approval-gated; all EXP/PROC checks read the active version.

---

## M12. Fixed Assets (FA)

- **FR-FA-001.1** Register fields per SRS + funding source (school/grant/donor — reportable), condition, warranty expiry.
- **FR-FA-003.1** Depreciation job (monthly, per category policy): SL: `(cost − residual)/life_months`; RB: `nbv × rate/12`; prorated from in-service month; batch journal (P-30) approval-gated `DEPRECIATION`; schedule regenerated on revaluation/transfer.
- **FR-FA-005.1** Disposal wizard: pick asset → method (sale/scrap/donation/write-off) → proceeds → computes gain/loss → approval `ASSET_DISPOSALS` → P-31, register status DISPOSED (record retained).
- **FR-FA-007.1** Verification session mirrors stock-take: scan/count, condition update, missing-asset report → write-off proposals.

---

## M13. Reports (RPT)

- **FR-RPT-001.1** Catalogue (all SRS-listed reports) organized by domain with per-report permission `reports:<code>:view`. Each report definition: parameters schema, columns, totals, default sort, export layouts.
- **FR-RPT-003.1** PDF exports: school header/footer/watermark/signature blocks per BRND; Excel: typed cells, frozen header, autofilter; CSV: RFC 4180, UTF-8 BOM.
- **FR-RPT-005.1** Threshold: > 10k rows or > 10 s estimate → background job → notification with 7-day download link (files in MinIO, access-controlled).
- **FR-RPT-007.1** Schedules: cron-style per report+parameters+recipients+format; failures alert the owner; all sends logged in COMM.

---

## M14. Communications (COMM)

- **FR-COMM-002.1** Channel adapters implement `NotificationChannel` interface (send, status, cost?); registry in Settings with priority order per channel type; failover walks the order on provider hard-failure.
- **FR-COMM-003.1** Event → template binding table (event, channel, template, enabled, audience rule); all SRS-listed events pre-seeded with sensible defaults (invoices/receipts ON for SMS+email; approvals ON in-app+push; payroll ON email).
- **FR-COMM-004.1** Template editor: merge-variable palette per event (typed), preview with sample record, per-locale variants, character/segment counter for SMS with cost estimate.
- **FR-COMM-005.1** Broadcast wizard: audience builder (class/stream/balance>x/custom list upload) → template/compose → cost estimate (recipients × segments × unit cost) → approval `BROADCASTS` if > threshold recipients → queued send → delivery report (sent/delivered/failed per recipient).
- **FR-COMM-006.1** Queue semantics: BullMQ per channel; retry 5× exponential (30 s→16 min); DLQ visible in ops page with requeue action; per-provider rate limits respected (token bucket).

---

## M15. Approval Workflows (APPR)

- **FR-APPR-001.1** `WorkflowDefinition` (domain code, name, active version) → `WorkflowVersion` (levels[], routing rules) → `ApprovalInstance` (document ref, state, current level, history[]). Domains pre-seeded: WAIVERS, DISCOUNTS, REFUNDS, REQUISITIONS, PURCHASE_ORDERS, SUPPLIER_PAYMENTS, EXPENSES, PETTY_CASH, PAYROLL, JOURNALS, BUDGETS, WALLET_OPS, PAYMENT_REVERSALS, STOCK_ADJUSTMENTS, DEPRECIATION, ASSET_DISPOSALS, BROADCASTS, + custom.
- **FR-APPR-002.1** Level spec: approver = role | named users | "initiator's department head"; mode SEQUENTIAL | PARALLEL(quorum n-of-m); amount routing: rule rows (min, max → chain variant); department scoping filter.
- **FR-APPR-003.1** Actions: APPROVE / REJECT(reason req.) / RETURN(reason req., document → DRAFT for edit + resubmit, restarting the chain); full trail rendered on the document (who, when, comment, level).
- **FR-APPR-005.1** Delegation: user sets delegate + date range (cannot delegate to the request's initiator); escalation: per-level SLA hours → reminder at 50%, escalate to next level/named fallback at 100%, all logged.
- **FR-APPR-007.1** Engine holds the ONLY transition to `APPROVED` for gated documents; posting services verify `approval_ref` validity before any GL effect.

---

## M16–M17. Settings & Branding (SET/BRND)

- **FR-SET-003.1** Every integration config panel: fields, encrypted persist (AES-256-GCM, app key), **Test Connection** button exercising a real harmless call (SMTP: NOOP/test mail; SMS: balance query; M-Pesa: OAuth token; QuickBooks: company info), status badge with last-tested timestamp.
- **FR-SET-006.1** Numbering series editor: per document type — prefix, pad width, period reset (never/yearly/termly), next number (raise-only); preview of next 3 numbers.
- **FR-BRND-001.1** Design tokens: `--color-primary` … `--color-surface`, `--font-family`, radius/spacing scale served as CSS variables from a `theme` endpoint; documents (PDF) read the same token set server-side. Infoney defaults per SRS palette.
- **FR-BRND-002.1** Branding studio sections: Identity (name/logo/favicon), Colors (with WCAG checker per FR-BRND-004), Login page (image, welcome text), Documents (invoice/receipt/report header-footer, signature images, watermark), Templates (email/SMS link into COMM), Theme default. Draft → Preview (side-by-side sample dashboard + sample invoice PDF) → Publish (versioned, revertible).

---

## M18–M19. Integrations & API (INTG/API)

- **FR-INTG-001.1** M-Pesa module internals: per-shortcode config rows (type PAYBILL/TILL/B2C, keys, passkey, callback base); token cache (Redis, TTL-aware); callback endpoints validate shortcode ownership + optional IP allowlist; every inbound/outbound payload persisted raw in `MpesaLog`; reconciliation view: M-Pesa transactions ↔ receipts with unmatched filters.
- **FR-INTG-007.1** Webhooks: subscription (url, secret, events[], active); delivery = signed `X-Klickit-Signature: t=…,v1=HMAC-SHA256(t.body)`; retries 8× over 24 h; auto-disable after 72 h of hard failures with admin alert.
- **FR-API-003.1** API keys: `kfe_live_…`/`kfe_test_…` prefixes, SHA-256 stored, scope = permission subset picker, expiry date, IP allowlist optional; last_used surfaced; revocation immediate (cache bust).
- **FR-API-005.1** Error envelope: `{ error: { code, message, details[], request_id } }`; codes catalogued (`VALIDATION_FAILED`, `INSUFFICIENT_PERMISSIONS`, `PERIOD_CLOSED`, `INSUFFICIENT_BALANCE`, `DUPLICATE_IDEMPOTENCY_KEY`, …) — full catalogue is a Phase 7 artifact.

---

## M20. Licensing (LIC)

- **FR-LIC-001.1** License file: JSON payload (school_id, plan, features[], valid_from, valid_to, grace_days) + Ed25519 signature (Infoney private key; public key baked into build). Validated at boot and every 6 h; state cached.
- **FR-LIC-002.1** Endpoint surface (exhaustive, versioned `/license/v1/*`): `POST register`, `POST subscription`, `POST activate`, `POST suspend`, `POST renew`, `POST deactivate`, `GET status`, `GET usage`, `POST update-notice`. Implemented in an isolated NestJS module whose repository layer imports ONLY license/usage tables — structural isolation per FR-LIC-004.
- **FR-LIC-005.1** `GET usage` payload (exact): `{version, uptime_s, active_users_30d, student_count, storage_bytes, last_backup_at, license_state}` — schema published to schools; a school-visible log shows every call and response body.
- **FR-LIC-006.1** Enforcement middleware: SUSPENDED → mutation endpoints (non-GET, except auth/export/backup) return `403 LICENSE_SUSPENDED`; UI shows read-only banner; DEACTIVATED → login restricted to System Admin with export/backup screens only.

## M21. Backup & Ops (BKP)

- **FR-BKP-001.1** Backup job: `pg_dump` custom format + MinIO/files tarball → tar → AES-256-GCM encrypt (passphrase from Settings, key-check block stored) → destinations fan-out → manifest (sizes, SHA-256, duration) → retention pruning (GFS 7/4/12).
- **FR-BKP-003.1** Verification: weekly restore-test into a scratch container, smoke query (row counts vs manifest), result logged + alert on failure.
- **FR-BKP-005.1** `/ops` page (System Admin): service healthchecks, queue depths + DLQ counts, disk %, DB size, last backup badge, app version + license state, log-level switch.

---

*End of Functional Requirements Decomposition. Traceability: every SRS FR maps to ≥1 decomposition or the master posting map; matrix in `05-acceptance-criteria.md` appendix.*

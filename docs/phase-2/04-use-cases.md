# KLICKIT FINANCE ERP — Phase 2

## Use Cases

| Field | Value |
|---|---|
| **Document ID** | KFE-UC-001 |
| **Version** | 1.0 |
| **Date** | 14 July 2026 |
| **Traces to** | KFE-SRS-001; KFE-FRD-001; KFE-BRC-001 |

Part A: the full use-case catalogue (72 use cases). Part B: fully dressed specifications for the 14 architecturally critical use cases. Every catalogued use case receives acceptance criteria in `05-acceptance-criteria.md` (fully dressed ones as Gherkin; the rest as AC checklists).

---

## Part A — Use Case Catalogue

| UC ID | Name | Primary actor | Traces to | Dressed? |
|---|---|---|---|---|
| UC-AUTH-01 | Log in (password + 2FA) | Any staff user | FR-AUTH-001/004 | ★ B.1 |
| UC-AUTH-02 | Reset forgotten password | Any user | FR-AUTH-008 | — |
| UC-AUTH-03 | Parent login via phone OTP | Parent | FR-AUTH-013 | — |
| UC-AUTH-04 | Manage sessions / log out everywhere | Any user | FR-AUTH-009 | — |
| UC-USER-01 | Create user & assign roles | System Admin | FR-USER-001/003/007 | — |
| UC-USER-02 | Define custom role | System Admin | FR-USER-003 | — |
| UC-USER-03 | Configure SoD pairs | System Admin | FR-USER-009 | — |
| UC-USER-04 | Review audit trail of an entity | Auditor | FR-AUD-003 | — |
| UC-DASH-01 | Review executive dashboard | Director | FR-DASH-001…012 | — |
| UC-BILL-01 | Register student (single/import) | Billing Officer | FR-BILL-001/002 | — |
| UC-BILL-02 | Define & publish fee structure | Bursar | FR-BILL-010…015 | — |
| UC-BILL-03 | Run bulk term billing | Bursar | FR-BILL-020/021 | ★ B.2 |
| UC-BILL-04 | Issue ad-hoc invoice | Billing Officer | FR-BILL-014/023 | — |
| UC-BILL-05 | Create installment plan | Billing Officer | FR-BILL-025 | — |
| UC-BILL-06 | Apply fee waiver (with approval) | Billing Officer→Bursar→Director | FR-BILL-040 | ★ B.3 |
| UC-BILL-07 | Configure & apply discount scheme | Bursar | FR-BILL-041 | — |
| UC-BILL-08 | Manage sponsor & apply bursary | Bursar | FR-BILL-042 | — |
| UC-BILL-09 | Issue credit note | Bursar | FR-BILL-050 | — |
| UC-BILL-10 | Refund credit balance | Bursar/Cashier | FR-BILL-052 | ★ B.4 |
| UC-BILL-11 | Send statements to guardians | Billing Officer | FR-BILL-060/061 | — |
| UC-BILL-12 | Work defaulters register | Bursar | FR-BILL-062/064 | — |
| UC-BILL-13 | Apply late fees batch | System (job)+Bursar | FR-BILL-026 | — |
| UC-BILL-14 | Promote students to new year | System Admin | FR-BILL-005 | — |
| UC-PAY-01 | Receive fee payment at counter (cash/split) | Cashier | FR-PAY-001…005/020…022 | ★ B.5 |
| UC-PAY-02 | Collect via M-Pesa STK Push | Cashier/Parent | FR-PAY-008 | ★ B.6 |
| UC-PAY-03 | Auto-process Paybill C2B payment | System | FR-PAY-009/010 | ★ B.7 |
| UC-PAY-04 | Resolve suspense payment | Bursar | FR-PAY-009 | — |
| UC-PAY-05 | Record & clear/bounce cheque | Cashier/Accountant | FR-PAY-007 | — |
| UC-PAY-06 | Allocate bulk sponsor payment | Bursar | FR-PAY-006 | — |
| UC-PAY-07 | Open/close cashier session | Cashier+Supervisor | FR-PAY-011 | ★ B.8 |
| UC-PAY-08 | Reverse a receipt | Bursar | FR-PAY-012 | — |
| UC-PAY-09 | Verify receipt authenticity (QR) | Any | FR-PAY-023 | — |
| UC-WALL-01 | Parent tops up wallet via STK | Parent | FR-WALL-002 | ★ B.9 |
| UC-WALL-02 | Charge wallet at service point | POS Operator | FR-WALL-003/004/005 | ★ B.10 |
| UC-WALL-03 | Set guardian spending controls | Parent | FR-WALL-010/011 | — |
| UC-WALL-04 | Lock/freeze wallet | Staff/Parent | FR-WALL-009 | — |
| UC-WALL-05 | Transfer wallet→fees | Parent/Staff | FR-WALL-007 | — |
| UC-WALL-06 | Refund wallet on exit clearance | Bursar | FR-WALL-008, BR-WALL-07 | — |
| UC-PROC-01 | Raise & approve requisition | Staff→approvers | FR-PROC-002 | — |
| UC-PROC-02 | Compare quotations & award | Procurement Officer | FR-PROC-003 | — |
| UC-PROC-03 | Issue purchase order | Procurement Officer | FR-PROC-004/005 | — |
| UC-PROC-04 | Receive goods (GRN) | Storekeeper | FR-PROC-006 | — |
| UC-PROC-05 | Match supplier invoice (3-way) | Accountant | FR-PROC-007 | ★ B.11 |
| UC-PROC-06 | Pay supplier | Accountant→approvers | FR-PROC-008 | — |
| UC-INV-01 | Issue stock to department | Storekeeper | FR-INV-003/004 | — |
| UC-INV-02 | Sell uniform (cash/wallet/account) | Shop operator | FR-INV-005 | — |
| UC-INV-03 | Conduct stock-take | Storekeeper+Bursar | FR-INV-009 | — |
| UC-EXP-01 | Capture & approve expense | Staff→approvers | FR-EXP-002 | — |
| UC-EXP-02 | Operate petty cash float | Custodian | FR-EXP-003 | — |
| UC-EXP-03 | Submit staff claim | Staff | FR-EXP-004 | — |
| UC-PYRL-01 | Process monthly payroll | Payroll Officer→approver | FR-PYRL-006 | ★ B.12 |
| UC-PYRL-02 | Issue staff loan & auto-recover | Payroll Officer | FR-PYRL-004 | — |
| UC-PYRL-03 | Generate statutory returns | Payroll Officer | FR-PYRL-009 | — |
| UC-PYRL-04 | Employee views payslip | Employee | FR-PYRL-008 | — |
| UC-BANK-01 | Import statement & reconcile | Accountant | FR-BANK-003/004 | ★ B.13 |
| UC-BANK-02 | Bank cash from safe | Accountant | FR-BANK-002 | — |
| UC-BANK-03 | Manage cheque register | Accountant | FR-BANK-005 | — |
| UC-ACC-01 | Post manual journal | Accountant→approver | FR-ACC-004 | — |
| UC-ACC-02 | Capture opening balances | Accountant | FR-ACC-006 | — |
| UC-ACC-03 | Close period / fiscal year | Accountant+Bursar | FR-ACC-007 | ★ B.14 |
| UC-ACC-04 | Maintain budget & revisions | Bursar | FR-ACC-009 | — |
| UC-FA-01 | Capitalize asset from GRN | Accountant | FR-FA-002 | — |
| UC-FA-02 | Run monthly depreciation | System+Accountant | FR-FA-003 | — |
| UC-FA-03 | Dispose asset | Accountant→approvers | FR-FA-005 | — |
| UC-RPT-01 | Run, export & schedule reports | Any permitted | FR-RPT-001…007 | — |
| UC-COMM-01 | Edit template & send broadcast | Bursar | FR-COMM-004/005 | — |
| UC-APPR-01 | Act on pending approvals | Any approver | FR-APPR-003/006 | — |
| UC-SET-01 | Configure integrations | System Admin | FR-SET-003 | — |
| UC-BRND-01 | Rebrand school instance | System Admin | FR-BRND-002/003 | — |
| UC-LIC-01 | Renew subscription / handle suspension | Super Admin + System | FR-LIC-002/006 | — |
| UC-BKP-01 | Backup now / restore drill | System Admin | FR-BKP-001…004 | — |

---

## Part B — Fully Dressed Use Cases

### B.1 UC-AUTH-01 — Log in with password + 2FA

- **Primary actor:** Staff user. **Preconditions:** Active user, ACTIVE license state (or better-than-DEACTIVATED). **Postconditions (success):** Session created, JWT issued, login event recorded.
- **Main flow:**
  1. User opens the school-branded login page and submits identifier + password.
  2. System verifies credentials, checks account status and IP restrictions (FR-AUTH-011).
  3. 2FA required → system prompts for TOTP; user submits valid code.
  4. System creates session + refresh token, records LoginEvent(success), routes to the role-appropriate dashboard.
- **Alternates/Exceptions:**
  - 2a. Bad credentials → generic failure message (no user enumeration); LoginEvent(failure); counter++ → lockout at threshold (FR-AUTH-007.1) with user notification.
  - 2b. SUSPENDED license → login proceeds; UI enters read-only mode with banner (BR-LIC-01).
  - 3a. Invalid TOTP ×5 → 2FA cooldown 15 min; recovery-code path offered (FR-AUTH-005).
  - 4a. `must_change_password` → forced change screen before any navigation.

### B.2 UC-BILL-03 — Run bulk term billing

- **Primary actor:** Bursar (`billing:bulk:execute`). **Preconditions:** PUBLISHED structures for target term; term OPEN. **Postconditions:** One posted invoice per eligible student; batch report stored; GL P-01 (+concessions) posted per invoice; notifications queued.
- **Main flow:**
  1. Bursar opens Bulk Billing wizard; selects term + scope (classes/streams/groups).
  2. System resolves each student's structure version (FR-BILL-011.1) and renders preview: N invoiceable, exceptions listed (no structure / already billed / inactive).
  3. Bursar confirms; system enqueues `billing.bulk`.
  4. Workers process chunks; each student = one transaction: build invoice (structure lines + optional items + auto-concessions per schemes), post (number, ledger, GL), queue guardian notification.
  5. On completion: summary report (created/skipped/failed with reasons); dashboard KPIs refresh; Bursar notified.
- **Alternates/Exceptions:**
  - 4a. Single-student failure (e.g., structure gap) → recorded in report; batch continues (FR-BILL-021).
  - 4b. Worker crash mid-batch → resumed job skips already-billed (idempotency BR-BILL-04); no duplicates.
  - 3a. Re-run of same scope → preview shows all as "already billed"; nothing double-posts.

### B.3 UC-BILL-06 — Apply fee waiver with approval

- **Primary actor:** Billing Officer (initiator); approvers per WAIVERS chain. **Preconditions:** Student has invoice with sufficient balance (BR-BILL-06). **Postconditions:** Approved waiver posted (P-02), trail on document, guardian optionally notified.
- **Main flow:**
  1. Officer opens student → invoice → "Request waiver": target lines, amount/percent, reason, attachments.
  2. System validates against BR-BILL-06/07 and routes by amount tier to the WAIVERS chain.
  3. Approvers act in sequence; each sees invoice, student history, prior concessions.
  4. Final approval → system posts concession (P-02), updates balances, records trail.
- **Alternates:** 3a. Rejection with reason → initiator notified; document closed (resubmission = new instance, BR-APPR-03). 3b. RETURN → initiator edits and resubmits; chain restarts. 2a. Initiator is also an approver in the chain → engine skips/blocks per BR-APPR-01, escalating to the alternate approver.

### B.4 UC-BILL-10 — Refund student credit balance

- **Primary actor:** Bursar; Cashier executes payout. **Preconditions:** Student credit balance ≥ refund amount (BR-BILL-12). **Postconditions:** P-12 posted; payout executed (cash/bank/B2C); refund voucher archived.
- **Main flow:** initiate (amount ≤ credit, reason, payee verification per BR-WALL-06 analog) → REFUNDS chain → approved → payout method: cash (cashier session) | bank (payment voucher) | M-Pesa B2C (async result) → on confirmation, post P-12 + receipt-style refund voucher to guardian.
- **Exceptions:** B2C failure/timeout → status `APPROVED_UNPAID`, retry queue + operator alert; credit consumed only on confirmed payout.

### B.5 UC-PAY-01 — Receive fee payment at counter

- **Primary actor:** Cashier. **Preconditions:** OPEN cashier session (BR-PAY-04). **Postconditions:** Receipt posted & delivered; ledger/GL updated; session totals updated.
- **Main flow:**
  1. Cashier searches student (adm no/name/guardian phone) — balance + open invoices shown.
  2. Cashier enters total and method splits (e.g., cash 5,000 + M-Pesa ref 3,000) — refs validated per method (BR-PAY-01).
  3. System proposes allocation per policy (BR-PAY-02); cashier reviews.
  4. Cashier posts: transactionally — receipt number, allocations, ledger, GL (P-08), session totals.
  5. Receipt prints (thermal); PDF email + SMS queue; new balance displayed.
- **Alternates/Exceptions:**
  - 2a. Amount exceeds cashier authority limit → supervisor override dialog (dual credential) or abort (FR-USER-005.1).
  - 3a. Overpayment → surplus to prepayments (P-09, BR-PAY-03), stated on receipt.
  - 4a. Post fails (e.g., period closed) → nothing persists; actionable error; no number consumed.
  - 5a. Printer offline → receipt remains posted; reprint available; delivery channels unaffected.

### B.6 UC-PAY-02 — Collect via M-Pesa STK Push

- **Primary actor:** Cashier (or Parent from portal). **Preconditions:** M-Pesa configured; connectivity. **Postconditions:** Receipt auto-posted on confirmation; MpesaTransaction logged.
- **Main flow:** select student → amount + payer phone → initiate STK → parent enters PIN on phone → callback received & validated → receipt auto-posts (P-08, idempotent on mpesa_ref BR-PAY-06) → cashier screen updates live (WebSocket); SMS receipt to payer.
- **Exceptions:** timeout 90 s → status-query fallback at +2 min → confirmed ? post : mark FAILED (retriable); duplicate callback → acknowledged, no effect; wrong-amount callback (paid ≠ requested) → receipt posts for actual paid amount, flagged for cashier review.

### B.7 UC-PAY-03 — Auto-process Paybill C2B payment

- **Primary actor:** System. **Preconditions:** C2B URLs registered. **Postconditions:** Receipt posted to matched student, or SuspenseItem created; nothing lost (BR-PAY-07).
- **Main flow:** confirmation callback → persist raw → dedupe on mpesa_ref → parse BillRefNumber via pattern list → student matched → auto-receipt (P-08, allocation policy) → guardian SMS.
- **Alternates:** no match → SuspenseItem(OPEN) + Bursar digest; validation callback (if enabled) may reject unknown refs at source per school policy; suspense resolution: match (retro-post with M-Pesa timestamp noted) or approval-gated refund.

### B.8 UC-PAY-07 — Open & close cashier session

- **Main flow:** open (till + float declared) → collect all day → close: system shows expected per method; cashier counts denominations; variance computed → within tolerance → supervisor sign-off → session CLOSED + report; cash-to-safe/bank document follows (BANK).
- **Exceptions:** variance beyond tolerance → supervisor credential + reason mandatory, variance flagged permanently (BR-PAY-05); unposted drafts block close; forgotten session auto-flags at day end for supervisor forced-close with audit.

### B.9 UC-WALL-01 — Parent tops up wallet via STK

- **Main flow:** parent portal → child → wallet → amount → STK to registered phone → PIN → callback → wallet credited (P-13) + top-up receipt + push/SMS confirmation with new balance.
- **Exceptions:** callback timeout → "pending" state visible to parent, resolves via status query — parent is never left guessing; duplicate → no double credit (idempotency key = mpesa_ref).

### B.10 UC-WALL-02 — Charge wallet at service point

- **Primary actor:** POS Operator (e.g., canteen). **Preconditions:** Operator assigned to service point; wallet ACTIVE. **Postconditions:** Wallet debited (P-14), guardian notified per preference.
- **Main flow:** scan student card (QR) → student photo + first name + balance-sufficient indicator shown (no balance amount to operator unless permitted) → items or amount → server checks: status, balance, per-txn/daily limits, category blocks (BR-WALL-02/03/04) → confirm → debit posts, operator sees success + student's new balance indicator.
- **Exceptions:** insufficient balance → decline with "insufficient funds" only; limit hit → decline naming the limit type; LOCKED/FROZEN → decline; offline LAN-to-server — POS requires server reachability (no offline spending in v1; documented constraint).

### B.11 UC-PROC-05 — Match supplier invoice (3-way)

- **Main flow:** capture supplier invoice against PO → system aligns lines to GRN quantities and PO prices → within tolerance → auto-pass to AP (P-20) → payable in next voucher run.
- **Exceptions:** price/qty variance beyond tolerance → exception queue with side-by-side (PO vs GRN vs invoice); resolver actions: accept variance (approval, posts to price-variance account), request credit note, reject invoice. Missing GRN → invoice parks as UNMATCHED (no posting).

### B.12 UC-PYRL-01 — Process monthly payroll

- **Primary actor:** Payroll Officer; approver per PAYROLL chain (distinct person, BR-PYRL-05). **Preconditions:** Statutory tables effective for period (BR-PYRL-01); prior period COMMITTED or none. **Postconditions:** Run COMMITTED (immutable), P-27 posted, payslips issued, payment files generated.
- **Main flow:**
  1. Officer creates run for period; system pulls active employees, salary structures, loans, one-offs.
  2. Compute (pipeline in FRD M9); run → COMPUTED.
  3. Officer reviews variance report vs prior period (threshold flags); adjusts inputs (one-offs) → recompute as needed.
  4. Submit → PAYROLL chain → approver reviews register + variance → approves.
  5. Commit: immutable snapshot, P-27 journal, payslips generated + links emailed, bank schedules/B2C files produced, statutory files available.
  6. Payment execution (bank upload or B2C) → runs PAID; statutory remittances recorded when paid (P-29).
- **Exceptions:** 2a. Missing statutory table → blocked with named error. 3a. Employee negative net (BR-PYRL-03) → recovery deferred automatically, flagged. 4a. Rejection → run returns to COMPUTED with comments. 6a. Partial B2C failures → per-employee retry queue; failed payees revert to bank-schedule path.

### B.13 UC-BANK-01 — Import statement & reconcile

- **Main flow:** choose account + upload file → mapping template applied → staging dedupe → reconciliation workspace → auto-match pass (ref → amount+date → suggestions) → manual matching for remainder → create adjustments (charges P-33, interest) → all statement lines matched → lock reconciliation (snapshot: book ± outstanding = bank).
- **Exceptions:** duplicate file re-import → staged lines deduped silently with count reported; unmatched book entries (e.g., uncleared cheques) → carried as outstanding items on the statement; lock attempt with unmatched statement lines → blocked with list.

### B.14 UC-ACC-03 — Close period / fiscal year

- **Main flow (period):** Accountant runs pre-close checklist (auto-evaluated: reconciliations locked BR-BANK-03, suspense zero, depreciation posted, invariants green) → SOFT_CLOSE (warnings on post) → review window → HARD_CLOSE (posting blocked BR-GEN-04).
- **Main flow (year):** all periods hard-closed → year-end wizard → closing journal (income/expense → Accumulated Fund) → next-year opening balances rolled → year LOCKED.
- **Exceptions:** checklist failure → close blocked with named blockers; reopen → `accounting:period:reopen` + approval + audit; post-reopen re-close repeats the checklist.

---

*Every catalogued UC without a dressed spec follows the same structural conventions (preconditions, main flow, exceptions) and is specified to test-case depth via its acceptance criteria in `05-acceptance-criteria.md`.*

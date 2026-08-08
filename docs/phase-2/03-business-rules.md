# KLICKIT FINANCE ERP — Phase 2

## Business Rules Catalogue

| Field | Value |
|---|---|
| **Document ID** | KFE-BRC-001 |
| **Version** | 1.0 |
| **Date** | 14 July 2026 |
| **Traces to** | KFE-SRS-001; KFE-FRD-001 |

Rules are normative and testable. Enforcement layer noted as: **UI** (guidance), **SVC** (service validation), **DB** (constraint/trigger), **WF** (workflow engine). Most rules are enforced at multiple layers.

---

## GEN — General & Financial Foundation

| ID | Rule | Enforced |
|---|---|---|
| BR-GEN-01 | The base and only operating currency is **KES**. All amounts are recorded, computed, and reported in KES. (Foreign-currency capability remains a dormant P3 feature; enabling it is a versioned configuration change.) | SVC/DB |
| BR-GEN-02 | Every financial posting must balance: Σ debits = Σ credits, exact to 4 decimal places. Unbalanced journals are rejected, never auto-plugged. | SVC/DB |
| BR-GEN-03 | No financial document that has reached POSTED status may be edited or deleted. Corrections occur only through reversing or adjusting documents that reference the original. | SVC/DB |
| BR-GEN-04 | No posting may target a HARD_CLOSED period. Posting to a SOFT_CLOSED period requires the dedicated permission and is flagged in audit. | SVC/DB |
| BR-GEN-05 | Rounding: amounts round half-up at line level to 2 dp for presentation; document totals are the sum of rounded lines; internal computation retains 4 dp. | SVC |
| BR-GEN-06 | A document's financial effect occurs exactly once, at POSTED transition, in the same DB transaction as its status change and number allocation. | SVC/DB |
| BR-GEN-07 | Document numbers are gapless per series and allocated only at posting. A voided document retains its number and appears in sequence audits as VOID. | SVC/DB |
| BR-GEN-08 | Backdating: document dates may precede today only within the open period window and only with the module's backdate permission; future-dating beyond 1 day is prohibited except scheduled billing. | SVC |
| BR-GEN-09 | Every mutation carries an authenticated actor; system-generated actions attribute to the named system principal (`system.billing`, `system.latefees`, …) — never anonymous, never impersonated. | SVC/DB |
| BR-GEN-10 | Control accounts accept postings only from their owning subsystem via the posting service; manual journals touching control accounts are blocked (or warn+approve where configured) . | SVC/DB |

## BILL — Billing & Student Finance

| ID | Rule | Enforced |
|---|---|---|
| BR-BILL-01 | A student must have exactly one ledger account, created automatically at registration and never deletable. | SVC/DB |
| BR-BILL-02 | An invoice may only be generated from a PUBLISHED fee structure version; DRAFT structures cannot bill. | SVC |
| BR-BILL-03 | A published fee structure version is immutable; changes create a new version. Invoices permanently reference the exact version that produced them. | SVC/DB |
| BR-BILL-04 | A student may receive at most one structure-generated invoice per (term, structure version); bulk billing re-runs skip already-billed students. | SVC/DB |
| BR-BILL-05 | Invoice due date ≥ issue date. Installment schedules must sum exactly to the invoice balance at plan creation, with strictly increasing due dates. | SVC/DB |
| BR-BILL-06 | Concessions (waiver/discount/scholarship/bursary) may not exceed the balance of the line/invoice they target; aggregate concessions on an invoice may not drive its balance negative. | SVC/DB |
| BR-BILL-07 | Every waiver requires a reason and completes its approval chain before posting. Waivers above the initiator's authority limit route to the higher chain tier automatically. | WF/SVC |
| BR-BILL-08 | Sibling/early-payment/staff discounts are mutually stackable only if the scheme flags allow stacking; otherwise the single largest applicable discount applies. | SVC |
| BR-BILL-09 | An invoice with any payment applied cannot be voided — only credit-noted. A credit note may not exceed the unsettled portion unless it explicitly creates a refundable credit. | SVC/DB |
| BR-BILL-10 | Late fees apply only to invoices/installments past due by more than the grace days in policy; exempt-flagged students and fully-sponsored lines are excluded. | SVC |
| BR-BILL-11 | Interest, where enabled, is simple interest on overdue principal only — never interest on interest or on late fees. | SVC |
| BR-BILL-12 | A refund may be paid only from an actual credit balance (prepayments or credit-note surplus), never creating a negative receivable. | SVC/DB |
| BR-BILL-13 | Sponsor awards apply only to the fee categories they cover, in invoice-line order, capped at award balance; unused award balance never converts to student cash credit unless the sponsor agreement flag permits. | SVC |
| BR-BILL-14 | Student promotion/rollover carries the full ledger balance forward; balances are never zeroed by academic-year change. | SVC |
| BR-BILL-15 | A student cannot be set to ALUMNI/TRANSFERRED with a nonzero balance unless a user with `billing:clearance:override` records a documented clearance decision (write-off via approval, or balance acknowledgment). | SVC/WF |

## PAY — Payments & Receipting

| ID | Rule | Enforced |
|---|---|---|
| BR-PAY-01 | A receipt's method splits must sum exactly to the receipt total, and each split must satisfy its method's mandatory references. | SVC/DB |
| BR-PAY-02 | Payment allocation order defaults to school policy (oldest-first or category priority); manual reallocation requires permission and is audit-logged with before/after. | SVC |
| BR-PAY-03 | Over-payment beyond open items always lands in prepayments (student credit) — a receipt can never leave unallocated "floating" money. | SVC/DB |
| BR-PAY-04 | Cash receipts can only be captured within an OPEN cashier session belonging to the capturing cashier. | SVC |
| BR-PAY-05 | A cashier session cannot close with unposted drafts; variance beyond tolerance requires supervisor credentials and a reason, and is reported on the session record permanently. | SVC/WF |
| BR-PAY-06 | An M-Pesa transaction reference may be consumed by exactly one receipt (global uniqueness); callback replays are acknowledged but produce no second effect. | SVC/DB |
| BR-PAY-07 | Unmatched C2B payments live in suspense — visible, reportable, and resolvable only by matching to a student or by an approval-gated refund. Suspense may never be silently written off. | SVC/WF |
| BR-PAY-08 | Receipt reversal requires a reason code and approval; a reversed receipt's allocations are unwound exactly, restoring invoice balances as if it had never existed (audit trail preserved). | WF/SVC |
| BR-PAY-09 | Wallet-method payments debit the wallet in the same transaction as the receipt posting; insufficient wallet balance aborts the whole receipt. | SVC/DB |
| BR-PAY-10 | A cheque-split receipt's funds count as UNCLEARED until the cheque clears; uncleared amounts are excluded from "banked cash" figures and flagged on statements. | SVC |
| BR-PAY-11 | Bounced cheques reverse automatically, may add the policy bounce fee, and set the cheque payer's flag such that further cheque acceptance requires supervisor override (configurable). | SVC |

## WALL — E-Wallet

| ID | Rule | Enforced |
|---|---|---|
| BR-WALL-01 | Wallet balance = Σ wallet transactions, always ≥ −overdraft_limit (default 0). No code path may set a balance directly. | SVC/DB |
| BR-WALL-02 | Wallet debits are serialized per wallet; concurrent debits cannot jointly exceed available balance. | SVC/DB |
| BR-WALL-03 | A LOCKED wallet accepts credits but no debits; a FROZEN wallet accepts neither. Status changes require a reason and notify the guardian. | SVC |
| BR-WALL-04 | Spending controls (daily/per-txn/category) are evaluated server-side on every debit; guardian-set limits may only tighten, never exceed, school policy maxima. | SVC |
| BR-WALL-05 | Wallet adjustments (non-transactional corrections) always require approval + reason code and appear distinctly labeled on the guardian-visible statement. | WF/SVC |
| BR-WALL-06 | Wallet refunds pay only to a verified guardian payout target (registered phone for B2C, named bank account, or in-person cash with ID capture). | SVC/WF |
| BR-WALL-07 | Student exit clearance requires wallet disposition: refund, transfer to sibling, or apply to fees — a closed wallet must end at exactly 0. | SVC/WF |
| BR-WALL-08 | Σ all wallet balances must equal the wallet liability control account at all times; a detected variance freezes manual wallet operations until resolved. | SVC (job) |

## PROC / INV — Procurement & Inventory

| ID | Rule | Enforced |
|---|---|---|
| BR-PROC-01 | Purchase commitments follow the chain: no PO without approved requisition (unless direct-PO permission), no GRN without issued PO, no supplier invoice posting without GRN for stock items (3-way match). | SVC/WF |
| BR-PROC-02 | PO totals commit budget: available budget = budget − actuals − open commitments; the block/warn policy of the budget line governs approval. | SVC |
| BR-PROC-03 | GRN quantities may not exceed outstanding PO quantities beyond the configured tolerance. | SVC/DB |
| BR-PROC-04 | Supplier payments may not exceed the supplier's open (approved, unpaid) invoice balance less credits. | SVC/DB |
| BR-PROC-05 | A blacklisted supplier cannot receive new POs; existing obligations remain payable. | SVC |
| BR-INV-01 | Stock on hand may never go negative in any store; issues/sales beyond availability are rejected. | SVC/DB |
| BR-INV-02 | Inventory value moves only with documented movements at weighted-average cost; valuation-method change takes effect only at a period boundary after approval. | SVC |
| BR-INV-03 | Stock adjustments from counts post only after approval; between snapshot and posting, movements on counted items are blocked (store-scope freeze). | SVC/WF |
| BR-INV-04 | Resale items (uniforms/books) must carry a sale price ≥ 0 and a COGS mapping before they can be sold. | SVC |

## EXP / PYRL — Expenses & Payroll

| ID | Rule | Enforced |
|---|---|---|
| BR-EXP-01 | Every expense must map to an expense category with a GL account and (if budgeting enabled) a budget line. | SVC |
| BR-EXP-02 | Petty cash vouchers cannot exceed the custodian's current float balance; replenishment restores at most to the approved float ceiling. | SVC/DB |
| BR-EXP-03 | Attachments are mandatory for expenses above the configured threshold (default KES 1,000). | SVC |
| BR-EXP-04 | No self-approval anywhere in an expense chain; payer ≠ approver ≠ (where configured) voucher creator. | WF |
| BR-PYRL-01 | Statutory computations always use the rate table effective on the payroll period's end date. Missing table for a period blocks the run with a named error. | SVC |
| BR-PYRL-02 | A payroll period can hold at most one COMMITTED main run; corrections use supplementary runs referencing it. | SVC/DB |
| BR-PYRL-03 | Loan recoveries cannot reduce net pay below the configurable protected-net floor (default: net ≥ 1/3 of basic, per Kenyan practice); shortfalls defer to subsequent periods automatically. | SVC |
| BR-PYRL-04 | An employee with exit date before the period start is excluded from the run; mid-period exits prorate per the day-count convention (calendar days). | SVC |
| BR-PYRL-05 | Payroll approval must be by a user distinct from the run initiator, with payroll-approve permission and authority ≥ run net total tier. | WF |
| BR-PYRL-06 | Committed payroll figures are immutable, including in audit displays; recomputation of a committed period is impossible. | SVC/DB |

## BANK / ACC — Banking & Accounting

| ID | Rule | Enforced |
|---|---|---|
| BR-BANK-01 | Inter-account transfers post both legs atomically via the transfer clearing account; the clearing account must return to zero per transfer. | SVC/DB |
| BR-BANK-02 | A statement line may reconcile against book entries only once; reconciled entries lock against modification. | SVC/DB |
| BR-BANK-03 | A period's bank reconciliation must be locked before that period can be HARD_CLOSED. | SVC |
| BR-BANK-04 | Cheque numbers issue sequentially per cheque book; skipping a leaf requires a CANCELLED record with reason. | SVC/DB |
| BR-ACC-01 | Accounts with any postings can be deactivated but never deleted; deactivated accounts reject new postings but appear in history. | SVC/DB |
| BR-ACC-02 | Manual journals require narration, balanced lines, and the JOURNALS approval chain; reversal journals must reference their original. | SVC/WF |
| BR-ACC-03 | Fiscal year close requires: all periods soft-closed, all bank reconciliations locked, depreciation posted for all periods, suspense items zero, invariant sweep green. | SVC |
| BR-ACC-04 | Opening balances post once, via the opening-balance equity account, and lock on confirmation; changes after lock require the reopening procedure with approval. | SVC/WF |
| BR-ACC-05 | Budget revisions never overwrite: each revision is a new version with its own approval trail; reports may compare any versions. | SVC |
| BR-FA-01 | Depreciation never reduces net book value below residual value; fully-depreciated assets stop depreciating automatically. | SVC |
| BR-FA-02 | A disposed/written-off asset cannot receive further transactions; its record and history remain permanently. | SVC/DB |

## APPR / SEC — Workflow & Security

| ID | Rule | Enforced |
|---|---|---|
| BR-APPR-01 | An initiator can never approve at any level of their own request, including via delegation or role overlap. | WF |
| BR-APPR-02 | Amount-tiered routing uses the document's total at submission; edits that change the total send the document back through the full chain. | WF |
| BR-APPR-03 | Approval decisions are final per instance: a rejected document may be revised and resubmitted as a new approval instance; trails of all instances persist. | WF |
| BR-APPR-04 | Workflow definition changes affect only documents submitted after the change; in-flight instances complete on their original version. | WF |
| BR-SEC-01 | Enabled SoD pairs block role assignment and runtime action alike (defense in depth). | SVC |
| BR-SEC-02 | Deactivated users are removed from all approval chains immediately; affected in-flight instances escalate per their escalation rule. | WF |
| BR-SEC-03 | Parents see only their linked students' data; a guardianship link change takes effect on next token refresh and is audit-logged. | SVC |
| BR-SEC-04 | Auditor-role grants are read-only by construction; the permission assembler rejects any write permission attached to an auditor-classed role. | SVC |

## LIC — Licensing

| ID | Rule | Enforced |
|---|---|---|
| BR-LIC-01 | License checks never block reads, exports, or backups in any state; SUSPENDED blocks financial mutations only; DEACTIVATED restricts login to System Admin export/backup surfaces. | SVC |
| BR-LIC-02 | The licensing module can structurally access only license and usage tables; CI enforces the import boundary (build fails if it references other repositories). | Build/SVC |
| BR-LIC-03 | Usage payload fields are exactly those of FR-LIC-005.1; adding a field is a breaking change requiring school-visible documentation and a licensing API version bump. | SVC |
| BR-LIC-04 | Every licensing API call (inbound and outbound) is logged school-visibly with full request/response bodies. | SVC |

---

**Total: 78 business rules.** Each rule maps to test cases in Phase 9 (`TC-BR-<id>-##`) and to Gherkin scenarios in `05-acceptance-criteria.md` where user-facing.

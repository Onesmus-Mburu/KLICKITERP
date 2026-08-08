# KLICKIT FINANCE ERP — Phase 2

## Acceptance Criteria

| Field | Value |
|---|---|
| **Document ID** | KFE-AC-001 |
| **Version** | 1.0 |
| **Date** | 14 July 2026 |
| **Traces to** | KFE-UC-001; KFE-BRC-001; KFE-FRD-001 |

Part A: Gherkin scenarios for the 14 fully dressed use cases (the executable-specification core — these become E2E tests in Phase 9). Part B: acceptance checklists per module covering the remaining catalogue. Part C: cross-cutting acceptance gates that apply to every feature. IDs: `AC-<UC>-##`.

---

## Part A — Gherkin Scenarios (critical paths)

### UC-AUTH-01 — Login

```gherkin
Feature: Staff login with password and 2FA

  Scenario: AC-AUTH01-01 Successful login with 2FA
    Given an active user "bursar@school.ac.ke" with 2FA enabled
    When she submits correct credentials
    Then she is prompted for a TOTP code
    When she submits a valid TOTP code
    Then a session is created and she lands on her role dashboard
    And a successful LoginEvent is recorded with IP and device

  Scenario: AC-AUTH01-02 Lockout after repeated failures
    Given an active user with 0 failed attempts
    When wrong passwords are submitted 5 times within 15 minutes
    Then the account is locked for 15 minutes
    And the response is identical in wording to an ordinary failure
    And the user is notified of the lockout by email
    And each attempt is recorded as a failed LoginEvent

  Scenario: AC-AUTH01-03 Read-only mode under suspended license
    Given the instance license state is SUSPENDED
    When any staff user logs in successfully
    Then the UI shows a persistent suspension banner
    And every financial mutation attempt returns LICENSE_SUSPENDED
    And reports, exports and backups remain fully available

  Scenario: AC-AUTH01-04 Reused refresh token kills the session family
    Given a user holds refresh token R1 which was already rotated to R2
    When R1 is presented again
    Then all sessions in that family are revoked
    And the user receives a security notification
```

### UC-BILL-03 — Bulk billing

```gherkin
Feature: Bulk term billing

  Background:
    Given a PUBLISHED fee structure v1 for Term 2 covering Grade 4 (Day: 15,000; Boarder: 25,000)
    And Grade 4 has 100 active students (80 day, 20 boarders), 2 inactive students

  Scenario: AC-BILL03-01 Preview shows exact outcome before commitment
    When the Bursar scopes bulk billing to Term 2, Grade 4
    Then the preview lists 100 invoiceable students totalling KES 1,700,000
    And the 2 inactive students appear as exceptions, not billable
    And no invoice exists until confirmation

  Scenario: AC-BILL03-02 Batch posts correctly and completely
    When the Bursar confirms the run
    Then within 5 minutes 100 invoices are POSTED with gapless sequential numbers
    And each invoice references structure version v1
    And AR–Student control increases by exactly KES 1,700,000
    And fee income accounts increase by the same amount per category split
    And 100 guardian notifications are queued
    And the completion report shows created=100 skipped=0 failed=0

  Scenario: AC-BILL03-03 Re-run is idempotent
    Given the run above completed
    When the Bursar runs the same scope again
    Then the preview shows 100 students as "already billed"
    And confirming creates 0 invoices and 0 GL postings

  Scenario: AC-BILL03-04 Mid-run crash does not duplicate or corrupt
    Given a bulk run is processing at student 50 of 100
    When the worker process is killed and restarts
    Then the resumed job completes the remaining students
    And exactly 100 invoices exist with no duplicates
    And the integrity sweep (sub-ledger vs control) passes
```

### UC-BILL-06 — Waiver approval

```gherkin
Feature: Fee waiver with approval chain

  Scenario: AC-BILL06-01 Waiver posts only after final approval
    Given student MW-0421 has an invoice with balance KES 12,000
    And the WAIVERS chain for amounts ≤ 20,000 is Bursar then Director
    When a Billing Officer requests a 50% waiver with reason and attachment
    Then the invoice balance remains KES 12,000 while approval is pending
    When the Bursar approves and then the Director approves
    Then a concession of KES 6,000 posts against the invoice
    And the GL shows Dr Concessions 6,000 / Cr AR control 6,000
    And the full decision trail is visible on the waiver document

  Scenario: AC-BILL06-02 Initiator can never self-approve
    Given the Bursar initiates a waiver
    And the Bursar is also level 1 of the WAIVERS chain
    Then the engine routes level 1 to the configured alternate approver
    And the Bursar sees no approve action on her own request

  Scenario: AC-BILL06-03 Waiver cannot exceed the target balance
    Given an invoice line with balance KES 3,000
    When a waiver of KES 5,000 is requested against that line
    Then the request is rejected at validation naming BR-BILL-06
```

### UC-BILL-10 — Credit refund

```gherkin
Feature: Refund of student credit balance

  Scenario: AC-BILL10-01 Refund only from real credit
    Given student KP-1102 has a credit balance of KES 4,500
    When the Bursar initiates a refund of KES 6,000
    Then validation rejects the request citing available credit KES 4,500

  Scenario: AC-BILL10-02 B2C refund settles only on confirmation
    Given an approved refund of KES 4,500 via M-Pesa B2C
    When the B2C request is submitted and the result callback confirms success
    Then the GL posts Dr Prepayments 4,500 / Cr M-Pesa clearing 4,500
    And the guardian receives a refund confirmation SMS
    But if the callback reports failure
    Then no posting occurs and the voucher shows APPROVED_UNPAID with retry available
```

### UC-PAY-01 — Counter payment

```gherkin
Feature: Counter fee payment with split methods

  Background:
    Given cashier Jane has an OPEN session with float KES 2,000
    And student AB-0099 owes invoice INV-000123 balance KES 10,000

  Scenario: AC-PAY01-01 Split payment posts atomically
    When Jane captures KES 8,000 as cash 5,000 + M-Pesa ref "SFC3XK91TQ" 3,000
    And posts the receipt
    Then a receipt with the next gapless number is POSTED
    And INV-000123 balance becomes KES 2,000
    And GL shows Dr Cash 5,000, Dr M-Pesa clearing 3,000 / Cr AR control 8,000
    And Jane's session cash total increases by exactly 5,000
    And the thermal receipt renders and PDF/SMS deliveries are queued

  Scenario: AC-PAY01-02 Overpayment becomes prepayment, never floats
    When Jane captures KES 12,000 cash against the KES 10,000 balance
    Then the invoice is fully PAID
    And KES 2,000 posts to Student Prepayments
    And the receipt states the credit carried forward

  Scenario: AC-PAY01-03 Duplicate M-Pesa reference is refused
    Given receipt R1 already consumed M-Pesa ref "SFC3XK91TQ"
    When any new receipt split cites "SFC3XK91TQ"
    Then posting is rejected naming the earlier receipt

  Scenario: AC-PAY01-04 Failed posting consumes nothing
    Given the accounting period for today is HARD_CLOSED
    When Jane attempts to post a receipt
    Then the post fails with PERIOD_CLOSED
    And no receipt number is consumed and no ledger or session change exists

  Scenario: AC-PAY01-05 Authority limit requires supervisor override
    Given Jane's authority limit is KES 50,000
    When she captures a receipt of KES 75,000
    Then posting requires a supervisor credential and reason
    And the override is recorded in the audit log with both identities
```

### UC-PAY-02 — STK Push

```gherkin
Feature: M-Pesa STK Push collection

  Scenario: AC-PAY02-01 Confirmed push auto-receipts
    Given the cashier initiates STK for student AB-0099, KES 5,000, phone 07XXXXXXXX
    When the parent authorizes and the signed callback arrives
    Then a receipt posts automatically referencing the M-Pesa receipt number
    And the cashier screen updates within 3 seconds via WebSocket
    And the payer receives an SMS receipt

  Scenario: AC-PAY02-02 Replayed callback has no second effect
    When the same callback is delivered 5 more times
    Then exactly one receipt exists for that M-Pesa reference

  Scenario: AC-PAY02-03 Timeout falls back to status query
    Given no callback arrives within 90 seconds
    Then the transaction shows PENDING and a status query fires at +2 minutes
    And a confirmed result posts the receipt, an unpaid result marks FAILED (retriable)
```

### UC-PAY-03 — C2B auto-match

```gherkin
Feature: Paybill C2B processing

  Scenario: AC-PAY03-01 Well-referenced payment auto-posts
    When a C2B confirmation arrives with BillRef "AB-0099" amount 7,000
    Then a receipt posts to student AB-0099 within 30 seconds
    And allocation follows the school's policy order
    And the guardian is notified

  Scenario: AC-PAY03-02 Unmatched payment is preserved in suspense
    When a C2B confirmation arrives with BillRef "JOHN" amount 3,000
    Then a SuspenseItem(OPEN) records the full payload
    And the M-Pesa clearing GL reflects the 3,000 (money is never unaccounted)
    And the Bursar's daily suspense digest includes it
    When the Bursar matches it to student CD-0500
    Then a receipt posts retroactively noting the original M-Pesa timestamp
    And the suspense item closes as MATCHED
```

### UC-PAY-07 — Cashier session

```gherkin
Feature: Cashier session lifecycle

  Scenario: AC-PAY07-01 Clean close within tolerance
    Given Jane's session expects cash KES 45,000 and tolerance is KES 0
    When she counts denominations totalling KES 45,000
    Then the supervisor signs off and the session closes with variance 0
    And the session report lists every receipt by method

  Scenario: AC-PAY07-02 Variance demands supervisor and reason, permanently flagged
    When she counts KES 44,500
    Then closing requires supervisor credentials and a written reason
    And the session record shows variance -500 permanently

  Scenario: AC-PAY07-03 Cash receipts impossible without an open session
    Given Jane has no open session
    When she attempts a cash receipt
    Then capture is blocked citing BR-PAY-04 (non-cash methods may proceed per policy)
```

### UC-WALL-01 / UC-WALL-02 — Wallet top-up & spend

```gherkin
Feature: Wallet top-up and service-point spending

  Scenario: AC-WALL01-01 STK top-up credits exactly once
    Given parent tops up child EF-0777 with KES 2,000 via STK
    When the callback confirms (and is later replayed twice)
    Then the wallet balance increases by exactly 2,000
    And GL shows Dr M-Pesa clearing / Cr Wallet liability 2,000
    And the parent gets confirmation with the new balance

  Scenario: AC-WALL02-01 POS charge respects balance and limits
    Given EF-0777 has balance 500, daily limit 300, category MEALS allowed
    When the canteen operator charges 250 for lunch
    Then the debit posts (Dr Wallet liability / Cr Meals income 250)
    And the same day a further charge of 100 is declined naming the daily limit

  Scenario: AC-WALL02-02 Concurrent debits cannot overspend
    Given a wallet with balance KES 100
    When two service points submit KES 80 charges simultaneously
    Then exactly one succeeds and one is declined for insufficient funds
    And the final balance is KES 20

  Scenario: AC-WALL02-03 Locked wallet blocks spend, allows top-up
    Given the guardian locked the wallet from the portal
    Then POS charges are declined as LOCKED
    But an M-Pesa top-up still credits successfully

  Scenario: AC-WALL-RECON Wallet control always reconciles
    Given any sequence of top-ups, spends, transfers and refunds
    When the hourly reconciliation job runs
    Then Σ wallet balances equals the wallet liability control balance exactly
```

### UC-PROC-05 — 3-way match

```gherkin
Feature: Supplier invoice 3-way matching

  Scenario: AC-PROC05-01 Clean match flows to AP
    Given PO-0045 for 100 reams @ 550 and a GRN of 100 reams
    When the supplier invoice for 100 @ 550 is captured
    Then it auto-matches and posts Dr GRN accrual 55,000 / Cr AP 55,000

  Scenario: AC-PROC05-02 Price variance beyond tolerance goes to exceptions
    Given price tolerance is 2%
    When the invoice arrives at 100 @ 600
    Then it parks in the exception queue showing PO vs GRN vs invoice side by side
    And accepting the variance (with approval) posts the 5,000 difference to price variance
```

### UC-PYRL-01 — Payroll run

```gherkin
Feature: Monthly payroll processing

  Scenario: AC-PYRL01-01 Computation follows effective statutory tables
    Given statutory tables effective for July 2026 are loaded
    And employee Wanjiru has basic 80,000, house allowance 20,000
    When the run computes
    Then her gross is 100,000 and NSSF, SHIF, AHL and PAYE match the
      table-driven expected values in the test fixture to the shilling
    And employer contributions are computed alongside

  Scenario: AC-PYRL01-02 Separation of duties on approval
    Given the Payroll Officer initiated the run
    Then that officer cannot approve it
    And only a distinct user with payroll approval authority can

  Scenario: AC-PYRL01-03 Committed run is immutable and fully posted
    When the approved run is committed
    Then payslips exist for every included employee
    And the P-27 journal balances: gross+employer expense = payables+net pay
    And no field of the run can be modified thereafter by any role

  Scenario: AC-PYRL01-04 Protected net floor defers recovery
    Given employee Otieno has net before loans of 30,000 and a loan installment of 25,000
    And the protected floor is 1/3 of basic (basic 45,000 → floor 15,000)
    Then only 15,000 is recovered this period
    And 10,000 defers automatically to next period with a flag on the register

  Scenario: AC-PYRL01-05 Missing statutory table blocks the run
    Given no SHIF table is effective for the period
    Then computation halts with an error naming the missing table
    And no partial figures are stored
```

### UC-BANK-01 — Reconciliation

```gherkin
Feature: Bank statement import and reconciliation

  Scenario: AC-BANK01-01 Auto-match then lock
    Given 40 statement lines and 38 matching book entries plus charges of 250
    When auto-match runs and the accountant creates the charges adjustment
    Then all statement lines are matched
    And locking stores the snapshot: book balance ± outstanding = bank balance

  Scenario: AC-BANK01-02 Duplicate import is inert
    When the same statement file is imported again
    Then 0 new staging lines are created and the report says "40 duplicates skipped"

  Scenario: AC-BANK01-03 Reconciled entries are immutable
    Given a locked reconciliation
    Then any attempt to reverse or modify a reconciled book entry is blocked
    Until a permitted user reopens the reconciliation with reason (audited)
```

### UC-ACC-03 — Period close

```gherkin
Feature: Period and year close

  Scenario: AC-ACC03-01 Close blocked until checklist green
    Given the July bank reconciliation is not locked
    When the accountant attempts HARD_CLOSE of July
    Then close is blocked listing "Bank reconciliation: Equity Bank ****1234"

  Scenario: AC-ACC03-02 Hard-closed period rejects postings everywhere
    Given July is HARD_CLOSED
    Then receipt posting, journal posting, expense posting and billing dated July
      all fail with PERIOD_CLOSED — via UI and API alike

  Scenario: AC-ACC03-03 Year-end rolls balances correctly
    When the fiscal year closes
    Then income and expense accounts close to Accumulated Fund
    And next year's opening trial balance equals this year's closing balance sheet
```

---

## Part B — Module Acceptance Checklists (remaining catalogue)

Each checklist item is a binary gate; module acceptance requires all its items plus Part C.

**AUTH/USER** — password policy enforced on set/change; reset tokens single-use & expiring; OTP login rate-limited; session list accurate with working revocation; role editor prevents SoD-violating assignments (BR-SEC-01); deactivated user loses access ≤ 60 s (BR-SEC-02); audit views filter correctly and export; sensitive-read events logged (FR-AUD-004).

**DASH** — every KPI equals its report-of-record figure for the same scope (FR-DASH-010); widgets independently degrade; realtime update ≤ 60 s; drill-throughs land pre-filtered; permission-filtered widget set per role.

**BILL (remaining)** — import validates and reports per row, re-import idempotent; structure versioning locks published versions (BR-BILL-03); installment plans sum-exact (BR-BILL-05); discount stacking per scheme flags (BR-BILL-08); sponsor utilization statement reconciles awards vs applications; statements match ledger to the shilling for any range; defaulter register figures agree with aging report; late-fee batch honors grace, exemptions, approval policy; promotion carries balances (BR-BILL-14); clearance rules on exit (BR-BILL-15).

**PAY (remaining)** — cheque lifecycle incl. bounce auto-reversal + fee + notification (BR-PAY-11); bulk sponsor allocation worksheet produces per-student receipts summing exactly to the instrument; receipt reversal restores balances exactly (BR-PAY-08); QR verification page confirms authentic receipts and flags unknown/void; daily collection summary = Σ session reports = GL cash/bank movement.

**WALL (remaining)** — guardian controls apply immediately and only tighten (BR-WALL-04); lock/freeze semantics per BR-WALL-03; transfers net to zero on control; exit clearance forces zero balance (BR-WALL-07); adjustment path always approval-gated (BR-WALL-05).

**PROC** — requisition→PO→GRN chain enforced (BR-PROC-01); budget commitment math verified (BR-PROC-02); GRN tolerance blocks over-receipt (BR-PROC-03); supplier payment capped at open balance (BR-PROC-04); blacklist blocks new POs (BR-PROC-05); statements & AP aging reconcile to control; quotation comparison records award rationale; rating composite computes from defined metrics.

**INV** — negative stock impossible under concurrency (BR-INV-01); weighted-average recomputation matches hand-calculated fixtures; 2-step transfers leave no in-transit orphans; stock-take freeze blocks movements in scope (BR-INV-03); all three uniform-sale paths post correct income+COGS pairs; reorder alerts fire at threshold with working requisition shortcut.

**EXP** — category→GL/budget mapping mandatory (BR-EXP-01); petty cash never exceeds float (BR-EXP-02); attachment threshold enforced (BR-EXP-03); recurring expenses draft on schedule and still require approval; budget WARN/BLOCK policies behave per line config with audited override.

**PYRL (remaining)** — loan schedules amortize correctly (flat & reducing fixtures); early settlement recalculates; P10/NSSF/SHIF/AHL files validate against provider format fixtures; payslip link access-controlled and expiring; P9 annual figures = Σ monthly; payroll data invisible to non-payroll roles everywhere incl. audit views (FR-PYRL-012).

**BANK (remaining)** — transfer clearing nets zero per transfer (BR-BANK-01); cheque register sequence integrity (BR-BANK-04); stale cheques auto-flag; safe/till movements require dual acknowledgment; cashbook/bank book tie to GL per account-period.

**ACC (remaining)** — CoA edit rules (BR-ACC-01); manual journal chain + reversal linkage (BR-ACC-02); opening balance lock (BR-ACC-04); trial balance always balances and equals ledger sums; statement drill-down reaches source documents ≤ 4 clicks; budget versioning (BR-ACC-05); ratios compute per documented formulas; unusual-posting flags fire on seeded patterns.

**FA** — capitalization from GRN carries cost & funding source; SL and RB depreciation match fixtures incl. proration and residual floor (BR-FA-01); transfers require acknowledgment; disposal gain/loss computed correctly (P-31); insurance expiry alerts; register NBV = GL asset accounts.

**RPT** — every catalogued report renders, filters, paginates, and exports to all four formats with branding; scheduled reports deliver on cron with failure alerts; >10k-row reports route to background with notification; all money totals reconcile to GL (FR-RPT-008 spot-check matrix).

**COMM** — all seeded triggers fire on their events per channel config; template editor previews with sample data and per-locale variants; broadcast cost estimate within 5% of provider-billed; failover walks provider order on hard failure; DLQ visible with working requeue; opt-outs honored except flagged essential notices.

**APPR** — amount-tier routing per BR-APPR-02; parallel quorum modes; delegation windows honored incl. BR-APPR-01 through delegation; SLA reminder + escalation timing; in-flight instances survive definition changes (BR-APPR-04); dashboard approval cards actionable with full context on mobile viewport.

**SET/BRND** — every integration panel's Test Connection exercises a real call and reports truthfully; numbering series preview accurate, next-number raise-only; branding publish applies everywhere (UI, PDFs, emails) with working revert; WCAG contrast warnings on non-compliant color picks; dark mode coverage on every screen with derived palette.

**INTG/API** — M-Pesa sandbox suite passes all flows incl. reversal & status query; webhook signatures verify against published recipe; auto-disable after sustained failure with alert; API keys scope/expire/revoke immediately; rate limits return 429 + Retry-After; error envelope consistent across all endpoints; OpenAPI spec validates and matches runtime behavior (contract test).

**LIC** — endpoint surface exactly per FR-LIC-002.1 (negative tests prove nothing else exists); usage payload schema-exact (BR-LIC-03); state machine transitions incl. grace expiry; offline validation through validity+grace without any call home; suspension/deactivation behavior per BR-LIC-01; school-visible licensing log complete (BR-LIC-04); update notices require consent, mandatory-by-date flag honored, pre-update backup automatic.

**BKP** — nightly backup produces encrypted, checksummed archives at all destinations; retention pruning per GFS policy; weekly restore-test passes; manual restore drill on clean host meets RTO ≤ 4 h; backup failure alerts within 15 min; ops page reflects true service states (verified by induced faults).

---

## Part C — Cross-Cutting Acceptance Gates (every feature)

| Gate | Criterion |
|---|---|
| C-01 States | Screen implements all six UI states (IR-003) — verified per screen checklist |
| C-02 RBAC | Every endpoint + UI action permission-checked; unauthorized = clean 403/UI state, never data leak |
| C-03 Audit | Every mutation appears in the audit log with correct before/after |
| C-04 Validation | Invalid input rejected at DTO, service, and DB layers with consistent messages |
| C-05 Money | All arithmetic through the Money library; fixtures verify rounding matrix |
| C-06 GL | Every financial action posts exactly per the Master Posting Map; invariant sweep green after every E2E suite |
| C-07 i18n | No hardcoded user-facing strings (pseudo-locale build passes) |
| C-08 A11y | Zero critical axe violations; keyboard-only completion of the flow |
| C-09 Responsive | Usable at 360/768/1440 px |
| C-10 Docs | Swagger annotations complete for every new endpoint |
| C-11 Tests | Unit + integration tests meeting NFR-MNT-003 gates accompany the feature |
| C-12 Immutability | Posted documents resist edit/delete via UI, API, and direct service call tests |

---

## Appendix — Traceability Matrix (summary)

| Phase 2 artifact | Coverage |
|---|---|
| FRD decompositions | 239/239 SRS FRs covered (module sections + master posting map) |
| Business rules | 78 rules, each citing its FR/SRS anchor |
| Use cases | 72 UCs covering all 21 modules; 14 fully dressed |
| Gherkin ACs | 42 scenarios over the 14 critical UCs |
| Checklists | 17 module checklists + 12 cross-cutting gates |

Full row-level FR↔UC↔AC↔BR matrix will be maintained as a living spreadsheet from Phase 3 onward (`docs/traceability.xlsx` equivalent in CSV).

---

**END OF PHASE 2 DELIVERABLES**

> **Phase gate:** Phase 2 awaits approval. Phase 3 will deliver: complete system architecture — architecture diagrams, modular-monolith vs microservices recommendation (with reasoning), folder and package structure, communication architecture, authentication flow, deployment architecture, and infrastructure architecture.

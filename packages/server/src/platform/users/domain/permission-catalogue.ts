import { PermissionCatalogueEntry, registerPermissions } from "../application/permission-registry";

/**
 * The single permission catalogue for the whole codebase (FR-USER-001.1) —
 * one entry per mutating (and a few read) endpoint, across every module.
 * Per PROGRESS.md's established convention, every module appends its codes
 * to THIS array rather than creating its own parallel catalogue file (see
 * the `settings:*` entries below, added by Module 2 — `platform/settings`
 * itself never imports this file; its controllers just use matching string
 * literals in `@RequirePermission(...)`, validated at runtime against the
 * DB-seeded `usr_permission` table, not at compile time). Migration `0900`
 * imports this array directly to seed `usr_permission` and to compose the
 * `System Admin` (all) / `Auditor` (all `isWrite=false`) system roles.
 */
export const PERMISSION_CATALOGUE: readonly PermissionCatalogueEntry[] = [
  // users:user:*
  { code: "users:user:create", module: "users", description: "Create a staff/parent user account", isWrite: true },
  { code: "users:user:update", module: "users", description: "Update a user's profile fields", isWrite: true },
  { code: "users:user:view", module: "users", description: "View user accounts", isWrite: false },
  {
    code: "users:user:suspend",
    module: "users",
    description: "Suspend a user account (ACTIVE -> SUSPENDED)",
    isWrite: true,
  },
  {
    code: "users:user:reactivate",
    module: "users",
    description: "Reactivate a suspended user (SUSPENDED -> ACTIVE)",
    isWrite: true,
  },
  {
    code: "users:user:deactivate",
    module: "users",
    description: "Permanently deactivate a user account",
    isWrite: true,
  },
  {
    code: "users:user:assign-department",
    module: "users",
    description: "Assign or change a user's department",
    isWrite: true,
  },
  {
    code: "users:user:set-authority-limit",
    module: "users",
    description: "Set a user's monetary authority limit (FR-USER-005.1)",
    isWrite: true,
  },
  // users:role:*
  { code: "users:role:create", module: "users", description: "Create a role", isWrite: true },
  { code: "users:role:update", module: "users", description: "Update a role's name/description", isWrite: true },
  { code: "users:role:view", module: "users", description: "View roles and their permissions", isWrite: false },
  {
    code: "users:role:assign",
    module: "users",
    description: "Assign a role to a user (FR-USER-009.1 SoD-checked)",
    isWrite: true,
  },
  {
    code: "users:role:assign-permission",
    module: "users",
    description: "Grant a permission to a role (BR-SEC-04 / FR-USER-009.1 checked)",
    isWrite: true,
  },
  // users:department:*
  { code: "users:department:create", module: "users", description: "Create a department", isWrite: true },
  { code: "users:department:update", module: "users", description: "Update a department", isWrite: true },
  { code: "users:department:view", module: "users", description: "View departments", isWrite: false },
  // auth:api-key:*
  {
    code: "auth:api-key:manage",
    module: "auth",
    description: "Create or revoke API keys (FR-API-003)",
    isWrite: true,
  },
  { code: "auth:api-key:view", module: "auth", description: "List API keys", isWrite: false },
  // auth:session:*
  {
    code: "auth:session:unlock",
    module: "auth",
    description: "System Admin unlock of a locked-out account (FR-AUTH-007.1)",
    isWrite: true,
  },
  // settings:setting:* (Module 2 — generic key/value store, FR-SET-003.1)
  { code: "settings:setting:view", module: "settings", description: "View settings (secret values redacted)", isWrite: false },
  {
    code: "settings:setting:write",
    module: "settings",
    description: "Upsert a setting, including secrets (AES-256-GCM encrypted at rest)",
    isWrite: true,
  },
  // settings:academic-year:*
  { code: "settings:academic-year:view", module: "settings", description: "View academic years", isWrite: false },
  {
    code: "settings:academic-year:manage",
    module: "settings",
    description: "Create/update an academic year and set which one is current",
    isWrite: true,
  },
  // settings:term:*
  { code: "settings:term:view", module: "settings", description: "View terms", isWrite: false },
  {
    code: "settings:term:manage",
    module: "settings",
    description: "Create/update a term, set which one is current, toggle billing lock",
    isWrite: true,
  },
  // settings:numbering-series:* (read-only — allocation is an internal service call, never a public endpoint)
  {
    code: "settings:numbering-series:view",
    module: "settings",
    description: "View numbering series and preview upcoming document numbers (FR-SET-006.1)",
    isWrite: false,
  },
  // settings:integration:* (FR-SET-003.1)
  { code: "settings:integration:view", module: "settings", description: "View integration configs (credentials never exposed)", isWrite: false },
  {
    code: "settings:integration:manage",
    module: "settings",
    description: "Create/update integration configs and trigger Test Connection",
    isWrite: true,
  },
  // settings:custom-field:*
  { code: "settings:custom-field:view", module: "settings", description: "View custom field definitions", isWrite: false },
  {
    code: "settings:custom-field:manage",
    module: "settings",
    description: "Create/update custom field definitions",
    isWrite: true,
  },
  // files:file:* (Module 3 — MinIO-backed object store, file_object)
  { code: "files:file:view", module: "files", description: "View file metadata and generate signed download URLs", isWrite: false },
  {
    code: "files:file:upload",
    module: "files",
    description: "Upload a file (stored in MinIO, metadata in file_object)",
    isWrite: true,
  },
  {
    code: "files:file:delete",
    module: "files",
    description: "Delete a file (removes the storage object, then the file_object row)",
    isWrite: true,
  },
  // branding:theme:* (Module 4 — brnd_theme, FR-BRND-001.1/FR-BRND-002.1)
  { code: "branding:theme:view", module: "branding", description: "View themes and preview their resolved bundle", isWrite: false },
  {
    code: "branding:theme:manage",
    module: "branding",
    description: "Create/update a theme (identity, colors, login page, documents config)",
    isWrite: true,
  },
  {
    code: "branding:theme:publish",
    module: "branding",
    description: "Publish a theme or revert to a previously archived one",
    isWrite: true,
  },
  // comms:template:* (Module 5 — comm_template)
  { code: "comms:template:view", module: "comms", description: "View comm templates", isWrite: false },
  {
    code: "comms:template:manage",
    module: "comms",
    description: "Create/update/delete a comm template",
    isWrite: true,
  },
  // comms:trigger-binding:* (Module 5 — comm_trigger_binding)
  { code: "comms:trigger-binding:view", module: "comms", description: "View trigger bindings", isWrite: false },
  {
    code: "comms:trigger-binding:manage",
    module: "comms",
    description: "Create/update a trigger binding (which event_code/channel pairs are enabled)",
    isWrite: true,
  },
  // comms:optout:* (Module 5 — comm_optout)
  {
    code: "comms:optout:manage",
    module: "comms",
    description: "Create/list/delete opt-out rows on behalf of a guardian",
    isWrite: true,
  },
  // comms:broadcast:* (Module 5 — comm_broadcast)
  { code: "comms:broadcast:view", module: "comms", description: "View broadcasts", isWrite: false },
  { code: "comms:broadcast:create", module: "comms", description: "Create a broadcast (starts as DRAFT)", isWrite: true },
  {
    code: "comms:broadcast:approve-submit",
    module: "comms",
    description: "Submit a broadcast for approval, approve it, or cancel it (Module 6 approval engine not yet built)",
    isWrite: true,
  },
  {
    code: "comms:broadcast:send",
    module: "comms",
    description: "Send an APPROVED broadcast (fans out comm_message rows to the resolved audience)",
    isWrite: true,
  },
  // comms:message:* (Module 5 — comm_message, read-only: sends only happen via broadcasts or internal service calls)
  { code: "comms:message:view", module: "comms", description: "View/filter the comm_message send log", isWrite: false },
  // approvals:workflow:* (Module 6 — appr_workflow_def/appr_workflow_version/appr_level/appr_routing_rule)
  {
    code: "approvals:workflow:view",
    module: "approvals",
    description: "View workflow definitions, versions, levels, and routing rules",
    isWrite: false,
  },
  {
    code: "approvals:workflow:manage",
    module: "approvals",
    description: "Create/update workflow definitions, publish new versions, edit levels/routing rules",
    isWrite: true,
  },
  // approvals:delegation:* (Module 6 — appr_delegation, FR-APPR-005.1)
  { code: "approvals:delegation:view", module: "approvals", description: "View approval delegations", isWrite: false },
  {
    code: "approvals:delegation:manage",
    module: "approvals",
    description: "Create/update/delete an approval delegation",
    isWrite: true,
  },
  // approvals:instance:* (Module 6 — appr_instance/appr_action)
  {
    code: "approvals:instance:view",
    module: "approvals",
    description: "View approval instances, the caller's inbox, and decision trails",
    isWrite: false,
  },
  {
    code: "approvals:instance:decide",
    module: "approvals",
    description: "Record APPROVE/REJECT/RETURN for an approval instance at its current level",
    isWrite: true,
  },
  // accounting:account:* (Module 7 — gl_account, the chart of accounts)
  { code: "accounting:account:view", module: "accounting", description: "View chart-of-accounts entries and the account tree", isWrite: false },
  {
    code: "accounting:account:manage",
    module: "accounting",
    description: "Create/update/deactivate/reactivate/hard-delete a gl_account",
    isWrite: true,
  },
  // accounting:fiscal-year:* (Module 7 — gl_fiscal_year)
  { code: "accounting:fiscal-year:view", module: "accounting", description: "View fiscal years and their periods", isWrite: false },
  {
    code: "accounting:fiscal-year:manage",
    module: "accounting",
    description: "Create a fiscal year (auto-generates its periods)",
    isWrite: true,
  },
  // accounting:period:* (Module 7 — gl_period)
  {
    code: "accounting:period:manage",
    module: "accounting",
    description: "Open/soft-close/hard-close a gl_period",
    isWrite: true,
  },
  // accounting:cost-center:* (Module 7 — gl_cost_center)
  { code: "accounting:cost-center:view", module: "accounting", description: "View cost centers", isWrite: false },
  {
    code: "accounting:cost-center:manage",
    module: "accounting",
    description: "Create/update/deactivate/reactivate a gl_cost_center",
    isWrite: true,
  },
  // accounting:budget:* (Module 7 — gl_budget/gl_budget_line)
  {
    code: "accounting:budget:manage",
    module: "accounting",
    description: "Create/update a budget and its lines, and manually activate/reject a PENDING_APPROVAL budget",
    isWrite: true,
  },
  {
    code: "accounting:budget:submit",
    module: "accounting",
    description: "Submit a DRAFT budget for approval",
    isWrite: true,
  },
  // accounting:journal:* (Module 7 — gl_journal/gl_journal_line)
  { code: "accounting:journal:view", module: "accounting", description: "View journals and their lines", isWrite: false },
  {
    code: "accounting:journal:post",
    module: "accounting",
    description: "Post a MANUAL journal entry, or reverse an existing journal",
    isWrite: true,
  },
  // accounting:integrity-sweep:* (Module 7 — gl_integrity_run, NFR-INT-002)
  {
    code: "accounting:integrity-sweep:run",
    module: "accounting",
    description: "Trigger an on-demand GL integrity sweep and view past sweep runs",
    isWrite: true,
  },
  // students:class:* (Module 8 — std_class/std_stream/std_fee_group config)
  {
    code: "students:class:view",
    module: "students",
    description: "View classes, streams, and fee groups",
    isWrite: false,
  },
  {
    code: "students:class:manage",
    module: "students",
    description: "Create/update classes, streams, and fee groups",
    isWrite: true,
  },
  // students:student:* (Module 8 — std_student)
  {
    code: "students:student:view",
    module: "students",
    description: "View students, including FR-PAY-002's cashier search",
    isWrite: false,
  },
  {
    code: "students:student:manage",
    module: "students",
    description: "Create/update a student, transition status, and mark exit_cleared",
    isWrite: true,
  },
  // students:guardian:* (Module 8 — std_guardian/std_student_guardian)
  {
    code: "students:guardian:manage",
    module: "students",
    description: "Create/update guardians and link/unlink them to students",
    isWrite: true,
  },
  // students:promotion:* (Module 8 — std_promotion_batch, FR-BILL-005)
  {
    code: "students:promotion:execute",
    module: "students",
    description: "Execute a year-rollover promotion batch and view past batches",
    isWrite: true,
  },
  // students:ledger:* (Module 8 — std_ledger_entry, read-only — writes only via posting flows)
  {
    code: "students:ledger:view",
    module: "students",
    description: "View a student's sub-ledger statement with running balance",
    isWrite: false,
  },
  // billing:fee-category:* (Module 9 — bill_fee_category)
  { code: "billing:fee-category:view", module: "billing", description: "View fee categories", isWrite: false },
  { code: "billing:fee-category:manage", module: "billing", description: "Create/update/activate/deactivate a fee category", isWrite: true },
  // billing:transport-route:* (Module 9 — bill_transport_route)
  { code: "billing:transport-route:view", module: "billing", description: "View transport routes", isWrite: false },
  { code: "billing:transport-route:manage", module: "billing", description: "Create/update/activate/deactivate a transport route", isWrite: true },
  // billing:fee-structure:* (Module 9 — bill_fee_structure/bill_fee_structure_line)
  { code: "billing:fee-structure:view", module: "billing", description: "View fee structures and their lines", isWrite: false },
  { code: "billing:fee-structure:manage", module: "billing", description: "Create/update a DRAFT fee structure and its lines", isWrite: true },
  { code: "billing:fee-structure:publish", module: "billing", description: "Publish a DRAFT fee structure (BR-BILL-03)", isWrite: true },
  // billing:optional-item:* (Module 9 — bill_student_optional_item, FR-BILL-013)
  { code: "billing:optional-item:view", module: "billing", description: "View a student's optional-item opt-ins", isWrite: false },
  { code: "billing:optional-item:manage", module: "billing", description: "Create/update/remove a student's optional-item opt-in", isWrite: true },
  // billing:concession-scheme:* (Module 9 — bill_concession_scheme)
  { code: "billing:concession-scheme:view", module: "billing", description: "View concession schemes", isWrite: false },
  { code: "billing:concession-scheme:manage", module: "billing", description: "Create/update/activate/deactivate a concession scheme", isWrite: true },
  // billing:concession:* (Module 9 — bill_concession, BR-BILL-06/BR-BILL-07)
  { code: "billing:concession:view", module: "billing", description: "View concessions/waivers", isWrite: false },
  { code: "billing:concession:request", module: "billing", description: "Request a concession/waiver (starts PENDING_APPROVAL)", isWrite: true },
  { code: "billing:concession:decide", module: "billing", description: "Approve/reject a PENDING_APPROVAL concession, or post an APPROVED concession standalone against an already-POSTED invoice", isWrite: true },
  // billing:sponsor:* (Module 9 — bill_sponsor)
  { code: "billing:sponsor:view", module: "billing", description: "View sponsors", isWrite: false },
  { code: "billing:sponsor:manage", module: "billing", description: "Create/update a sponsor", isWrite: true },
  // billing:sponsor-award:* (Module 9 — bill_sponsor_award, FR-BILL-042.1/BR-BILL-13)
  { code: "billing:sponsor-award:view", module: "billing", description: "View sponsor awards and their remaining coverage", isWrite: false },
  { code: "billing:sponsor-award:manage", module: "billing", description: "Create/update a sponsor award", isWrite: true },
  // billing:invoice:* (Module 9 — bill_invoice/bill_invoice_line, the core billing engine)
  { code: "billing:invoice:view", module: "billing", description: "View invoices and their lines", isWrite: false },
  { code: "billing:invoice:generate", module: "billing", description: "Generate a DRAFT invoice (STRUCTURE/ADHOC/RECURRING)", isWrite: true },
  { code: "billing:invoice:post", module: "billing", description: "Post a DRAFT invoice (realizes P-01..P-04)", isWrite: true },
  { code: "billing:invoice:void", module: "billing", description: "Void a POSTED invoice with no payment applied (BR-BILL-09)", isWrite: true },
  // billing:bulk-billing:* (Module 9 — BulkBillingService, FR-BILL-020.1)
  { code: "billing:bulk-billing:execute", module: "billing", description: "Execute a bulk-billing run across a class/stream population", isWrite: true },
  // billing:credit-note:* (Module 9 — bill_credit_note/bill_credit_note_line, P-06, BR-BILL-09's correction path)
  { code: "billing:credit-note:view", module: "billing", description: "View credit notes and their lines", isWrite: false },
  { code: "billing:credit-note:manage", module: "billing", description: "Create a credit note, submit/decide its approval, and post it (P-06)", isWrite: true },
  // billing:debit-note:* (Module 9 — bill_debit_note/bill_debit_note_line, P-07)
  { code: "billing:debit-note:view", module: "billing", description: "View debit notes and their lines", isWrite: false },
  { code: "billing:debit-note:manage", module: "billing", description: "Create a debit note and post it (P-07, via InvoicingService)", isWrite: true },
  // billing:refund-voucher:* (Module 9 — bill_refund_voucher, P-12, FR-BILL-052.1)
  { code: "billing:refund-voucher:view", module: "billing", description: "View refund vouchers", isWrite: false },
  { code: "billing:refund-voucher:manage", module: "billing", description: "Create a refund voucher, submit/decide its approval, and cancel it", isWrite: true },
  { code: "billing:refund-voucher:mark-paid", module: "billing", description: "Mark an APPROVED_UNPAID refund voucher PAID (interim placeholder for the Module 10 M-Pesa B2C callback)", isWrite: true },
  // billing:late-fee-policy:* (Module 9 — bill_late_fee_policy, BR-BILL-10/BR-BILL-11)
  { code: "billing:late-fee-policy:view", module: "billing", description: "View late-fee policies", isWrite: false },
  { code: "billing:late-fee-policy:manage", module: "billing", description: "Create/update/activate/deactivate a late-fee policy", isWrite: true },
  // billing:late-fee-batch:* (Module 9 — bill_late_fee_batch, FR-BILL-025.1/FR-BILL-026.1)
  { code: "billing:late-fee-batch:view", module: "billing", description: "View late-fee batches and their summaries", isWrite: false },
  { code: "billing:late-fee-batch:run", module: "billing", description: "Run a late-fee batch, decide its PENDING_APPROVAL outcome, and post it", isWrite: true },
  // payments:session:* (Module 10 — pay_cashier_session, BR-PAY-04/BR-PAY-05, FR-PAY-011.1)
  { code: "payments:session:open", module: "payments", description: "Open a cashier session", isWrite: true },
  { code: "payments:session:close", module: "payments", description: "Close a cashier session (supervisor approval required beyond payments.session_variance_tolerance)", isWrite: true },
  { code: "payments:session:view", module: "payments", description: "View the calling cashier's currently OPEN session", isWrite: false },
  // payments:receipt:* (Module 10 — pay_receipt/pay_receipt_split/pay_receipt_allocation, BR-PAY-01/02/03/08)
  { code: "payments:receipt:capture", module: "payments", description: "Capture a (possibly split-method) receipt against a student", isWrite: true },
  { code: "payments:receipt:reverse", module: "payments", description: "Submit and execute a PAYMENT_REVERSALS-approved receipt reversal (BR-PAY-08)", isWrite: true },
  { code: "payments:receipt:view", module: "payments", description: "View receipts, including their splits and allocations", isWrite: false },
  { code: "payments:receipt:reprint", module: "payments", description: "Increment a receipt's reprint_count and re-fetch it for reprinting", isWrite: true },
  // Phase 6 Slice 8 (Part 4) — a real, separately-granted scope escalation
  // over payments:receipt:view: that permission lets a caller view ONE
  // student's (or one session's) receipts; this one additionally lets them
  // list receipts across EVERY student, unscoped. Seeded by a dedicated
  // migration (0230-add-payments-receipt-view-all-permission.ts) rather than
  // editing the already-applied 0900 seed migration — see that migration's
  // own doc comment.
  {
    code: "payments:receipt:view-all",
    module: "payments",
    description: "List receipts across ALL students, unscoped (neither studentId nor sessionId) — a real privacy escalation over payments:receipt:view",
    isWrite: false,
  },
  // payments:mpesa:* (Module 10 — pay_mpesa_transaction, FR-PAY-008.1/FR-PAY-009.1; the 4 Daraja callback endpoints are @Public(), not permission-guarded)
  { code: "payments:mpesa:initiate", module: "payments", description: "Initiate an M-Pesa STK push or B2C payout", isWrite: true },
  // payments:suspense:* (Module 10 — pay_suspense_item, BR-PAY-07)
  { code: "payments:suspense:manage", module: "payments", description: "List OPEN suspense items, match one to a student, or submit/execute an approval-gated refund", isWrite: true },
  // payments:cheque:* (Module 10 — pay_cheque, FR-PAY-007.1)
  { code: "payments:cheque:manage", module: "payments", description: "View cheques, clear an UNCLEARED cheque, or bounce one (optionally applying a bounce fee)", isWrite: true },
  // payments:bulk-allocation:* (Module 10 — pay_bulk_allocation_batch/pay_bulk_allocation_batch_line)
  { code: "payments:bulk-allocation:manage", module: "payments", description: "Create a bulk-allocation batch and run its match-and-post step", isWrite: true },
  // wallet:wallet:* (Module 11 — wall_wallet, BR-WALL-01..04/07)
  { code: "wallet:wallet:view", module: "wallet", description: "View a wallet by id/studentId and list its transactions", isWrite: false },
  { code: "wallet:wallet:manage", module: "wallet", description: "Get-or-create a wallet, set its status (ACTIVE/LOCKED/FROZEN), and update its limits/category blocks", isWrite: true },
  { code: "wallet:wallet:close", module: "wallet", description: "Close a wallet via a zeroing disposition (REFUND/TRANSFER_TO_SIBLING/APPLY_TO_FEES, BR-WALL-07)", isWrite: true },
  // wallet:transaction:* (Module 11 — wall_transaction, P-13..P-17)
  { code: "wallet:transaction:topup", module: "wallet", description: "P-13 wallet top-up", isWrite: true },
  { code: "wallet:transaction:spend", module: "wallet", description: "P-14 wallet spend at a service point", isWrite: true },
  { code: "wallet:transaction:transfer", module: "wallet", description: "P-15/P-17 wallet-to-fees or wallet-to-wallet transfer, including the WALLET_TRANSFER two-step approval dance", isWrite: true },
  { code: "wallet:transaction:refund", module: "wallet", description: "P-16 wallet refund, including the WALLET_REFUND two-step approval dance (FR-WALL-013.1)", isWrite: true },
  { code: "wallet:transaction:adjust", module: "wallet", description: "BR-WALL-05 manual wallet adjustment, including the WALLET_ADJUSTMENT two-step approval dance", isWrite: true },
  // wallet:service-point:* (Module 11 — wall_service_point/wall_service_point_operator)
  { code: "wallet:service-point:manage", module: "wallet", description: "View/create/update service points and assign/unassign operators", isWrite: true },
  // wallet:reconciliation:* (Module 11 — BR-WALL-08/FR-WALL-012.1)
  { code: "wallet:reconciliation:run", module: "wallet", description: "Run an on-demand wallet-vs-GL reconciliation sweep and view the latest result", isWrite: true },
  // procurement:supplier:* (Module 12 — proc_supplier)
  { code: "procurement:supplier:view", module: "procurement", description: "View/search suppliers", isWrite: false },
  { code: "procurement:supplier:manage", module: "procurement", description: "Create/update a supplier", isWrite: true },
  { code: "procurement:supplier:blacklist", module: "procurement", description: "BR-PROC-05: blacklist or reactivate a supplier", isWrite: true },
  // procurement:requisition:* (Module 12 — proc_requisition/proc_requisition_line, FR-PROC-002.1)
  { code: "procurement:requisition:view", module: "procurement", description: "View requisitions and their lines", isWrite: false },
  { code: "procurement:requisition:create", module: "procurement", description: "Create a requisition, manage its DRAFT lines, and cancel it", isWrite: true },
  { code: "procurement:requisition:submit", module: "procurement", description: "Submit a DRAFT requisition for approval (captures the BR-PROC-02 budget snapshot)", isWrite: true },
  { code: "procurement:requisition:decide", module: "procurement", description: "Manually record a PENDING_APPROVAL requisition's approve/reject decision", isWrite: true },
  // procurement:quotation:* (Module 12 — proc_quotation/proc_quotation_line)
  { code: "procurement:quotation:manage", module: "procurement", description: "Capture a quotation and its lines, view quotations, and award one (uq_proc_quotation_award_p)", isWrite: true },
  // procurement:po:* (Module 12 — proc_purchase_order/proc_po_line, FR-PROC-004.1, BR-PROC-01/05)
  { code: "procurement:po:create", module: "procurement", description: "Create a PO from an APPROVED requisition, view POs, and revise an ISSUED+ PO", isWrite: true },
  { code: "procurement:po:create-direct", module: "procurement", description: "BR-PROC-01's direct-PO escape hatch — create a PO with no requisition (separate from ordinary requisition-based creation)", isWrite: true },
  { code: "procurement:po:submit", module: "procurement", description: "Submit a DRAFT PO for approval", isWrite: true },
  { code: "procurement:po:decide", module: "procurement", description: "Manually record a PENDING_APPROVAL PO's approve/reject decision", isWrite: true },
  { code: "procurement:po:issue", module: "procurement", description: "Issue an APPROVED PO (the trg_proc_po_immutable freeze point)", isWrite: true },
  // procurement:grn:* (Module 12 — proc_grn/proc_grn_line, BR-PROC-01/03, P-18/P-19)
  { code: "procurement:grn:receive", module: "procurement", description: "Receive goods against an ISSUED+ PO, and view GRNs/their lines", isWrite: true },
  { code: "procurement:grn:post", module: "procurement", description: "Post a DRAFT GRN (realizes P-18/P-19)", isWrite: true },
  // procurement:supplier-invoice:* (Module 12 — proc_supplier_invoice, FR-PROC-007.1, P-20)
  { code: "procurement:supplier-invoice:manage", module: "procurement", description: "Capture, view, and post (P-20) supplier invoices", isWrite: true },
  { code: "procurement:supplier-invoice:match", module: "procurement", description: "Run the FR-PROC-007.1 3-way match and resolve a MATCH_EXCEPTION", isWrite: true },
  // procurement:payment-voucher:* (Module 12 — proc_payment_voucher/proc_voucher_allocation, FR-PROC-008.1, BR-PROC-04, P-21)
  { code: "procurement:payment-voucher:manage", module: "procurement", description: "Create a payment voucher, view it, and submit/decide its SUPPLIER_PAYMENTS approval", isWrite: true },
  { code: "procurement:payment-voucher:execute", module: "procurement", description: "Execute an APPROVED payment voucher (realizes P-21 and the remittance advice email)", isWrite: true },
  // procurement:contract:* (Module 12 — proc_contract)
  { code: "procurement:contract:manage", module: "procurement", description: "Create/update a contract, view contracts, terminate/mark-expired one, and list ones expiring soon", isWrite: true },
  // procurement:rating:* (Module 12 — FR-PROC-011.1 supplier ratings)
  { code: "procurement:rating:manage", module: "procurement", description: "Recompute auto-metrics (rejection rate) and set a manual 1-5 supplier rating", isWrite: true },
  // inventory:category:* / inventory:store:* (Module 13 — inv_category/inv_store)
  { code: "inventory:category:manage", module: "inventory", description: "Create/update an item category (also used to view/list categories)", isWrite: true },
  { code: "inventory:store:manage", module: "inventory", description: "Create/update a stock store/location (also used to view/list stores)", isWrite: true },
  // inventory:item:* (Module 13 — inv_item, BR-INV-04)
  { code: "inventory:item:view", module: "inventory", description: "View/search items and barcode-lookup", isWrite: false },
  { code: "inventory:item:manage", module: "inventory", description: "Create/update an item (BR-INV-04 resale-price/income-account enforced)", isWrite: true },
  // inventory:movement:* (Module 13 — inv_stock_balance/inv_movement, BR-INV-01/03)
  { code: "inventory:movement:view", module: "inventory", description: "View stock balances and movement history for an item/store", isWrite: false },
  { code: "inventory:movement:issue", module: "inventory", description: "Manually issue stock to a department (distinct from the stock-take adjustment path)", isWrite: true },
  // inventory:transfer:* (Module 13 — inv_transfer/inv_transfer_line)
  { code: "inventory:transfer:issue", module: "inventory", description: "Issue an inter-store transfer (and cancel one before it's received)", isWrite: true },
  { code: "inventory:transfer:receive", module: "inventory", description: "Receive an issued/in-transit transfer at its destination store", isWrite: true },
  // inventory:stock-take:* (Module 13 — inv_stock_take/inv_stock_take_line, FR-INV-009.1, BR-INV-03)
  { code: "inventory:stock-take:create", module: "inventory", description: "Create a stock-take session (the BR-INV-03 freeze point)", isWrite: true },
  { code: "inventory:stock-take:count", module: "inventory", description: "Record counted quantities against a stock-take's lines", isWrite: true },
  { code: "inventory:stock-take:submit", module: "inventory", description: "Submit a REVIEW stock-take for STOCK_ADJUSTMENTS approval", isWrite: true },
  { code: "inventory:stock-take:decide", module: "inventory", description: "Manually record a PENDING_APPROVAL stock-take's approve/return decision", isWrite: true },
  { code: "inventory:stock-take:post", module: "inventory", description: "Post an APPROVED stock-take (realizes P-24)", isWrite: true },
  // expenses:category:* (Module 14 — exp_category, BR-EXP-01)
  { code: "expenses:category:manage", module: "expenses", description: "Create/update/view expense categories (BR-EXP-01: requires a valid GL expense account)", isWrite: true },
  // expenses:voucher:* (Module 14 — exp_voucher, FR-EXP-002.1, BR-EXP-03, P-25)
  { code: "expenses:voucher:create", module: "expenses", description: "Create/update/view a DRAFT expense voucher", isWrite: true },
  { code: "expenses:voucher:submit", module: "expenses", description: "Submit a DRAFT voucher for approval (BR-EXP-03 attachment check)", isWrite: true },
  { code: "expenses:voucher:decide", module: "expenses", description: "Manually record a PENDING_APPROVAL voucher's approve/reject decision", isWrite: true },
  { code: "expenses:voucher:pay", module: "expenses", description: "Pay an APPROVED voucher (realizes P-25)", isWrite: true },
  // expenses:petty-cash:* (Module 14 — exp_petty_cash_float/exp_petty_cash_voucher/exp_replenishment, FR-EXP-003.1, BR-EXP-02, P-26)
  { code: "expenses:petty-cash:manage", module: "expenses", description: "Create/view petty cash floats, update ceilings, view vouchers/replenishments", isWrite: true },
  { code: "expenses:petty-cash:spend", module: "expenses", description: "Spend against a petty cash float (BR-EXP-02)", isWrite: true },
  { code: "expenses:petty-cash:replenish-request", module: "expenses", description: "Request a petty cash replenishment", isWrite: true },
  { code: "expenses:petty-cash:replenish-decide", module: "expenses", description: "Manually record a PENDING_APPROVAL replenishment's approve/reject decision", isWrite: true },
  { code: "expenses:petty-cash:replenish-execute", module: "expenses", description: "Execute an APPROVED replenishment (realizes P-26)", isWrite: true },
  // expenses:claim:* (Module 14 — exp_claim/exp_claim_line)
  { code: "expenses:claim:create", module: "expenses", description: "Create/update a DRAFT expense claim and its lines, view claims", isWrite: true },
  { code: "expenses:claim:submit", module: "expenses", description: "Submit a DRAFT claim for approval (EXPENSE_CLAIMS chain)", isWrite: true },
  { code: "expenses:claim:decide", module: "expenses", description: "Manually record a PENDING_APPROVAL claim's approve/reject decision", isWrite: true },
  { code: "expenses:claim:reimburse", module: "expenses", description: "Reimburse an APPROVED claim (DIRECT cash payment or PAYROLL accrual)", isWrite: true },
  // expenses:recurring:* (Module 14 — exp_recurring)
  { code: "expenses:recurring:manage", module: "expenses", description: "Create/update/view a recurring expense voucher template", isWrite: true },
  { code: "expenses:recurring:run", module: "expenses", description: "Manually run due recurring templates (materializes DRAFT exp_voucher rows — no scheduler exists in this codebase)", isWrite: true },
  // payroll:employee:* (Module 15 — pyrl_employee, FR-PYRL-012.1)
  { code: "payroll:employee:view", module: "payroll", description: "View payroll employees — encrypted pay/bank fields returned REDACTED", isWrite: false },
  { code: "payroll:employee:manage", module: "payroll", description: "Create/update/exit a payroll employee; also gates the decrypted pay/bank-details read endpoint", isWrite: true },
  // payroll:component:* (Module 15 — pyrl_component)
  { code: "payroll:component:manage", module: "payroll", description: "Create/update/view payroll earning/deduction components", isWrite: true },
  // payroll:structure:* (Module 15 — pyrl_salary_structure/pyrl_structure_component)
  { code: "payroll:structure:manage", module: "payroll", description: "Create/update/view salary structures and their component lines", isWrite: true },
  // payroll:assignment:* (Module 15 — pyrl_employee_assignment)
  { code: "payroll:assignment:manage", module: "payroll", description: "Assign/end an employee's salary-structure assignment", isWrite: true },
  // payroll:employee-component:* (Module 15 — pyrl_employee_component)
  { code: "payroll:employee-component:manage", module: "payroll", description: "Add/end an employee-specific component override", isWrite: true },
  // payroll:statutory-table:* (Module 15 — pyrl_statutory_table, FR-PYRL-003)
  { code: "payroll:statutory-table:manage", module: "payroll", description: "Create/update/view statutory PAYE/NSSF/SHIF/AHL rate tables", isWrite: true },
  // payroll:oneoff:* (Module 15 — pyrl_oneoff)
  { code: "payroll:oneoff:manage", module: "payroll", description: "Create/update/delete/view a one-off earning or deduction for an employee/period", isWrite: true },
  // payroll:loan:* (Module 15 — pyrl_loan/pyrl_loan_schedule, FR-PYRL-004.1)
  { code: "payroll:loan:create", module: "payroll", description: "Create a staff loan application and view loans/schedules", isWrite: true },
  { code: "payroll:loan:decide", module: "payroll", description: "Record a PENDING_APPROVAL loan's approve/reject decision, a manual recovery, or an early settlement", isWrite: true },
  // payroll:run:* (Module 15 — pyrl_run/pyrl_run_line/pyrl_run_line_component, FR-PYRL-006.1)
  { code: "payroll:run:view", module: "payroll", description: "View payroll runs, their lines, and line component breakdowns", isWrite: false },
  { code: "payroll:run:create", module: "payroll", description: "Create a DRAFT payroll run (MAIN or SUPPLEMENTARY)", isWrite: true },
  { code: "payroll:run:compute", module: "payroll", description: "Compute (or recompute) a DRAFT/COMPUTED run's lines", isWrite: true },
  { code: "payroll:run:submit", module: "payroll", description: "Review a COMPUTED run and submit it for approval", isWrite: true },
  { code: "payroll:run:decide", module: "payroll", description: "Manually record a PENDING_APPROVAL run's approve/return decision", isWrite: true },
  { code: "payroll:run:commit", module: "payroll", description: "Commit an APPROVED run (realizes P-27, BR-PYRL-02/06)", isWrite: true },
  { code: "payroll:run:pay", module: "payroll", description: "Disburse a COMMITTED run's net pay (realizes P-28)", isWrite: true },
  { code: "payroll:run:file", module: "payroll", description: "Mark a PAID run's statutory filing administratively complete", isWrite: true },
  // banking:account:* (Module 16 — bank_account)
  { code: "banking:account:manage", module: "banking", description: "Create/update/view bank/cash/M-Pesa-settlement/petty accounts", isWrite: true },
  // banking:transfer:* (Module 16 — bank_transfer, BR-BANK-01, P-32)
  { code: "banking:transfer:create", module: "banking", description: "Create/view a DRAFT bank transfer and submit it for approval", isWrite: true },
  { code: "banking:transfer:decide", module: "banking", description: "Manually record a PENDING_APPROVAL transfer's approve/reject decision", isWrite: true },
  { code: "banking:transfer:post", module: "banking", description: "Post an APPROVED transfer (realizes P-32's 2-leg TRANSFER_CLEARING journal)", isWrite: true },
  // banking:deposit:* (Module 16 — bank_deposit, FR-BANK-002.1)
  { code: "banking:deposit:create", module: "banking", description: "Create/view a DRAFT bank deposit and submit it for approval", isWrite: true },
  { code: "banking:deposit:decide", module: "banking", description: "Manually record a PENDING_APPROVAL deposit's approve/reject decision", isWrite: true },
  { code: "banking:deposit:post", module: "banking", description: "Post an APPROVED deposit, and record its FR-BANK-007 dual acknowledgment", isWrite: true },
  // banking:withdrawal:* (Module 16 — bank_withdrawal, FR-BANK-002.1's mirror event)
  { code: "banking:withdrawal:create", module: "banking", description: "Create/view a DRAFT bank withdrawal and submit it for approval", isWrite: true },
  { code: "banking:withdrawal:decide", module: "banking", description: "Manually record a PENDING_APPROVAL withdrawal's approve/reject decision", isWrite: true },
  { code: "banking:withdrawal:post", module: "banking", description: "Post an APPROVED withdrawal, and record its FR-BANK-007 dual acknowledgment", isWrite: true },
  // banking:statement:* (Module 16 — bank_statement_import/bank_statement_line, FR-BANK-003.1)
  { code: "banking:statement:import", module: "banking", description: "Import bank statement lines against a saved mapping template (dedupe-on-reimport)", isWrite: true },
  // banking:reconciliation:* (Module 16 — bank_reconciliation/bank_recon_match, FR-BANK-004.1)
  { code: "banking:reconciliation:manage", module: "banking", description: "Start/auto-match/manual-match/adjust/lock a reconciliation workspace", isWrite: true },
  { code: "banking:reconciliation:reopen", module: "banking", description: "Reopen a LOCKED reconciliation with a required reason (a distinct, more privileged code per FR-BANK-004.1)", isWrite: true },
  // banking:cheque-book:*/banking:cheque-leaf:* (Module 16 — bank_cheque_book/bank_cheque_leaf, FR-BANK-005.1, BR-BANK-04)
  { code: "banking:cheque-book:manage", module: "banking", description: "Register a cheque book (auto-generates its leaf range)", isWrite: true },
  { code: "banking:cheque-leaf:issue", module: "banking", description: "BR-BANK-04 — auto-issue the next sequential UNUSED leaf in a book", isWrite: true },
  { code: "banking:cheque-leaf:manage", module: "banking", description: "View leaves, mark presented/cleared, stop, cancel (explicit-skip reason), and flag-stale", isWrite: true },
  // fixed-assets:category:* (Module 17 — fa_category, the depreciation-policy bucket)
  { code: "fixed-assets:category:manage", module: "fixed-assets", description: "Create/update/view fixed-asset categories (requires all 3 GL account mappings)", isWrite: true },
  // fixed-assets:asset:* (Module 17 — fa_asset, FR-FA-001.1)
  { code: "fixed-assets:asset:view", module: "fixed-assets", description: "View/search assets, barcode-lookup", isWrite: false },
  { code: "fixed-assets:asset:manage", module: "fixed-assets", description: "Register/update an asset, and update its condition", isWrite: true },
  // fixed-assets:depreciation:* (Module 17 — fa_depreciation_run/fa_depreciation_line, FR-FA-003.1, BR-FA-01, P-30)
  { code: "fixed-assets:depreciation:run", module: "fixed-assets", description: "Create+compute a depreciation run, view runs/lines, and submit for approval", isWrite: true },
  { code: "fixed-assets:depreciation:decide", module: "fixed-assets", description: "Manually record a PENDING_APPROVAL depreciation run's approve/return decision", isWrite: true },
  { code: "fixed-assets:depreciation:post", module: "fixed-assets", description: "Post an APPROVED depreciation run (realizes P-30, per-category aggregated)", isWrite: true },
  // fixed-assets:transfer:* (Module 17 — fa_transfer)
  { code: "fixed-assets:transfer:create", module: "fixed-assets", description: "Transfer an asset to a new location/custodian, view transfers, and acknowledge receipt", isWrite: true },
  // fixed-assets:maintenance:* (Module 17 — fa_maintenance)
  { code: "fixed-assets:maintenance:manage", module: "fixed-assets", description: "Schedule/complete a maintenance event, view maintenance history", isWrite: true },
  // fixed-assets:disposal:* (Module 17 — fa_disposal, FR-FA-005.1, BR-FA-02, P-31)
  { code: "fixed-assets:disposal:create", module: "fixed-assets", description: "Create a disposal (computes gain/loss), view disposals, and submit for approval", isWrite: true },
  { code: "fixed-assets:disposal:decide", module: "fixed-assets", description: "Manually record a PENDING_APPROVAL disposal's approve/return decision", isWrite: true },
  { code: "fixed-assets:disposal:post", module: "fixed-assets", description: "Post an APPROVED disposal (realizes P-31; sets fa_asset.status='DISPOSED')", isWrite: true },
  // fixed-assets:verification:* (Module 17 — fa_verification/fa_verification_line, FR-FA-007.1)
  { code: "fixed-assets:verification:create", module: "fixed-assets", description: "Create a verification session, view sessions/lines, and submit for approval", isWrite: true },
  { code: "fixed-assets:verification:count", module: "fixed-assets", description: "Record found/condition/notes against a verification session's lines", isWrite: true },
  { code: "fixed-assets:verification:decide", module: "fixed-assets", description: "Manually record a PENDING_APPROVAL verification session's approve/return decision", isWrite: true },
  { code: "fixed-assets:verification:post", module: "fixed-assets", description: "Post an APPROVED verification session (applies condition updates; returns the missing-asset write-off-proposal report)", isWrite: true },
  // reports:<code>:view (Module 18 — one per report-of-record/domain report; gates POST /reports/:code/execute via a DYNAMIC in-handler check, not a static @RequirePermission — see ReportsController's own doc comment)
  { code: "reports:trial-balance:view", module: "reports", description: "Execute the Trial Balance report", isWrite: false },
  { code: "reports:balance-sheet:view", module: "reports", description: "Execute the Balance Sheet report", isWrite: false },
  { code: "reports:income-statement:view", module: "reports", description: "Execute the Income Statement report", isWrite: false },
  { code: "reports:general-ledger:view", module: "reports", description: "Execute the General Ledger report", isWrite: false },
  { code: "reports:cashbook:view", module: "reports", description: "Execute the Cashbook report", isWrite: false },
  { code: "reports:student-statement:view", module: "reports", description: "Execute the Student Statement report", isWrite: false },
  { code: "reports:aging-outstanding:view", module: "reports", description: "Execute the Aging/Outstanding report", isWrite: false },
  { code: "reports:cash-flow:view", module: "reports", description: "Execute the Cash Flow report (FR-DASH-002.1's KPI, as a report-of-record)", isWrite: false },
  { code: "reports:fee-collection:view", module: "reports", description: "Execute the Fee Collection report", isWrite: false },
  { code: "reports:receipts-register:view", module: "reports", description: "Execute the Receipts Register report", isWrite: false },
  { code: "reports:invoices-register:view", module: "reports", description: "Execute the Invoices Register report", isWrite: false },
  { code: "reports:payroll-summary:view", module: "reports", description: "Execute the Payroll Summary report", isWrite: false },
  { code: "reports:expense-summary:view", module: "reports", description: "Execute the Expense Summary report", isWrite: false },
  { code: "reports:supplier-statement:view", module: "reports", description: "Execute the Supplier Statement report", isWrite: false },
  { code: "reports:wallet-activity:view", module: "reports", description: "Execute the Wallet Activity report", isWrite: false },
  { code: "reports:statutory-summary:view", module: "reports", description: "Execute the Statutory Summary (PAYE/NSSF/SHIF/AHL figures) report — a documented stand-in, not a real filing-format output", isWrite: false },
  {
    code: "reports:audit-log:view",
    module: "reports",
    description: "Execute/query the Audit Log report — a DISTINCTLY privileged code, deliberately not bundled with ordinary reports:*:view access (audit visibility is sensitive)",
    isWrite: false,
  },
  { code: "reports:saved-params:manage", module: "reports", description: "Create/view/update/delete the caller's own saved report parameter sets (rpt_saved_params, owner-scoped)", isWrite: true },
  { code: "reports:schedule:manage", module: "reports", description: "CRUD rpt_schedule and manually trigger the run-due batch (no scheduler exists yet)", isWrite: true },
  { code: "reports:export:create", module: "reports", description: "Create a report export job (CSV: real synchronous generation; XLSX/PDF: queued placeholder) and view its status", isWrite: true },
  { code: "dashboard:view", module: "dashboard", description: "View Dashboard KPI tiles/charts and manually trigger a materialized-view refresh (FR-DASH-002.1/006.1)", isWrite: false },
  // integrations:webhook:* (Module 19 — intg_webhook_subscription/intg_webhook_delivery, FR-INTG-007.1)
  { code: "integrations:webhook:view", module: "integrations", description: "View webhook subscriptions and deliveries", isWrite: false },
  { code: "integrations:webhook:manage", module: "integrations", description: "Create/update a webhook subscription, rotate its secret, disable/enable it", isWrite: true },
  { code: "integrations:webhook:retry", module: "integrations", description: "Manually retry a single webhook delivery, or trigger the process-due batch (no scheduler exists yet)", isWrite: true },
  // integrations:sync:* (Module 19 — intg_sync_log, accounting-sync adapters)
  { code: "integrations:sync:push", module: "integrations", description: "Push an entity to the configured accounting-sync adapter (QuickBooks/Xero/Sage)", isWrite: true },
  { code: "integrations:sync:test", module: "integrations", description: "Test Connection against the configured accounting-sync adapter (FR-SET-003.1)", isWrite: false },
  { code: "integrations:sync:view", module: "integrations", description: "View the intg_sync_log accounting-sync push history", isWrite: false },
  // backups:run:* / backups:restore:* / backups:retention:* (Module 20 — bkp_backup_run/bkp_restore_run, FR-BKP-001.1/003.1)
  { code: "backups:run:create", module: "backups", description: "Run a backup now (SCHEDULED/MANUAL/PRE_UPDATE) — pg_dump + files-bucket mirror + AES-256-GCM encrypt + multi-destination fan-out", isWrite: true },
  { code: "backups:run:view", module: "backups", description: "View backup runs, including their destinations/manifest", isWrite: false },
  { code: "backups:restore:verify", module: "backups", description: "FR-BKP-003.1 restore-verify — pg_restore + row-count-vs-manifest smoke query against an already-reachable target", isWrite: true },
  { code: "backups:retention:prune", module: "backups", description: "Run GFS retention pruning (7 daily / 4 weekly / 12 monthly), deleting pruned runs' destination files and rows", isWrite: true },
  // ops:health:* (Module 20 — FR-BKP-005.1 /ops page)
  { code: "ops:health:view", module: "ops", description: "View /ops health summary — service healthchecks, disk %, DB size, last-backup badge, app version, license state, log level", isWrite: false },
  // license:status:* (Module 21 — Licensing, the isolated `license` schema module; license-status.controller.ts's staff-facing read surface)
  {
    code: "license:status:view",
    module: "license",
    description: "View the current license state/plan/expiry, the school-visible /license/v1/* call log (BR-LIC-04), and update notices",
    isWrite: false,
  },
] as const;

registerPermissions(PERMISSION_CATALOGUE);

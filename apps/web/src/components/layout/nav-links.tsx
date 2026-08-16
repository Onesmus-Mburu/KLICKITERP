"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Banknote, Boxes, CheckSquare, ChevronDown, CreditCard, GraduationCap, HandCoins, Landmark, LayoutDashboard, Layers, Megaphone, Package, Palette, Receipt, ServerCog, Settings, ShieldCheck, Truck, UserCog, Wallet, WalletCards } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { hasAnyRole } from "@/lib/permissions";
import { useAuthStore } from "@/lib/auth-store";

/**
 * The nav gating mechanism described in docs/phase-6/PROGRESS.md flagged
 * decision #1: coarse role-NAME gating from the decoded JWT (`allowedRoles:
 * []` means "visible to any authenticated user" — used here since this
 * slice ships exactly one nav entry and every staff role that can log in
 * plausibly has SOME dashboard visibility; a future module with a narrower
 * audience would list its real allowed role names here instead). This is
 * explicitly NOT the real permission check — that's `<QueryBoundary>`'s
 * 403-driven job once the route itself loads.
 *
 * Phase 6 Slice 8 — `children` is a new, optional field (genuinely new
 * pattern: nav was 100% flat before this pass). An item WITH `children`
 * renders as an expand/collapse GROUP instead of a direct link — its own
 * `href` is kept only as a stable group key (still useful for
 * `isActiveNavItem()`'s "which entry is this" bookkeeping), not something a
 * user can click through to directly; see `NavLinks()`'s render function
 * for the group-vs-leaf branch.
 */
interface NavChild {
  href: string;
  labelKey: string;
}

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  allowedRoles: readonly string[];
  children?: readonly NavChild[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, allowedRoles: [] },
  // Phase 6 Slice 2 (Students, Module 8) — same `allowedRoles: []` reasoning
  // as `dashboard`: coarse role-NAME gating can't target the real
  // `students:student:view` permission specifically (no permission-list
  // endpoint exists anywhere in this codebase, per this file's own doc
  // comment above), so the nav link stays visible to any authenticated
  // staff user; the REAL enforcement is `<QueryBoundary>`'s 403-driven
  // state once `/students` itself loads (see StudentsPage's `useStudents()`
  // query — a `students:student:view`-missing role hits a real 403 there,
  // not a silently-hidden nav item pretending to be the security boundary).
  { href: "/students", labelKey: "students", icon: GraduationCap, allowedRoles: [] },
  // Phase 6 Slice 2b item 6 (Classes & Streams management) — same
  // `allowedRoles: []`/`<QueryBoundary>`-is-the-real-gate reasoning as
  // `students` above (`students:class:view`/`:manage` are the real
  // permissions, no permission-list endpoint exists to target them
  // precisely from a coarse role-name check).
  { href: "/students/classes", labelKey: "classes", icon: Layers, allowedRoles: [] },
  // Phase 6 Slice 3 (Billing core loop, Module 9) — same `allowedRoles: []`/
  // `<QueryBoundary>`-is-the-real-gate reasoning as `students`/`classes`
  // above: `billing:fee-category:view`/`billing:fee-structure:view`/
  // `billing:invoice:view` are the real permissions, no permission-list
  // endpoint exists to target them precisely from a coarse role-name check.
  //
  // Phase 6 Slice 8 — first nav item to gain `children`: the Billing
  // landing page (Fee Categories, unchanged route/content) is re-homed as
  // one child rather than deleted, alongside the new bulk "Generate
  // Invoice" screen as a second child (Part 1). Part 2 added Pending
  // Invoices (`/billing/pending`) and Upcoming Invoices (`/billing/upcoming`).
  // Part 3 added a 5th child — Collect Fees (`/billing/collect`) — the
  // shared directed multi-invoice collection flow both entry points (this
  // nav item, and every Pending/Upcoming row's own "Collect" link) now point
  // at. Part 4 adds the 6th and FINAL child — Receipts (`/billing/receipts`,
  // the new global/unscoped Receipts list, gated server-side by
  // `payments:receipt:view-all`) — completing this dropdown; no more
  // children are added after this.
  {
    href: "/billing/fee-categories",
    labelKey: "billing",
    icon: Receipt,
    allowedRoles: [],
    children: [
      { href: "/billing/fee-categories", labelKey: "billingFeeCategories" },
      { href: "/billing/generate", labelKey: "billingGenerateInvoice" },
      { href: "/billing/pending", labelKey: "billingPendingInvoices" },
      { href: "/billing/upcoming", labelKey: "billingUpcomingInvoices" },
      { href: "/billing/collect", labelKey: "billingCollectFees" },
      { href: "/billing/receipts", labelKey: "billingReceipts" },
    ],
  },
  // Phase 6 Slice 4 (Payments core loop, Module 10) — same `allowedRoles: []`/
  // `<QueryBoundary>`-is-the-real-gate reasoning as every other entry above:
  // `payments:session:view`/`payments:receipt:capture`/`:view` are the real
  // permissions, no permission-list endpoint exists to target them precisely
  // from a coarse role-name check. Points at the payments landing page
  // (session status + this session's receipts + "New Receipt" link into
  // `/payments/capture`), mirroring `billing`'s own "land on the entry
  // screen, link onward" shape.
  { href: "/payments", labelKey: "payments", icon: Wallet, allowedRoles: [] },
  // Phase 6 Slice 5 (Approvals engine frontend, Module 6) — same
  // `allowedRoles: []`/`<QueryBoundary>`-is-the-real-gate reasoning as every
  // other entry above: `approvals:instance:view` is the real permission, no
  // permission-list endpoint exists to target it precisely from a coarse
  // role-name check. Points at the inbox (`GET /approvals/instances/inbox`)
  // — this engine already backs 18 real domain codes (Payments' receipt
  // reversals plus 17 more across Billing/Wallet/Procurement/Payroll/
  // Banking/Fixed Assets/Inventory/Expenses/GL, per the `0900` seed
  // migration), so this one nav entry is genuinely reusable beyond Payments,
  // not a Payments-specific link routed through a generic-sounding name.
  { href: "/approvals", labelKey: "approvals", icon: CheckSquare, allowedRoles: [] },
  // Phase 6 Slice 11 (Part 2) — the Wallet module's first nav entry (Module
  // 11 had NO home in the flat nav at all before this pass). Styled as a
  // `children`-bearing dropdown FROM THE START (the same mechanism Billing
  // established in Slice 8). `WalletCards` (not `Wallet`, already used
  // by the Payments entry above) is the icon, to avoid two identical icons
  // in the sidebar. Same `allowedRoles: []`/`<QueryBoundary>`-is-the-real-
  // gate reasoning as every other entry — `wallet:wallet:view` is the real
  // permission, no permission-list endpoint exists to target it precisely
  // from a coarse role-name check.
  //
  // Phase 6 Slice 11 (Part 3) — 2 more children appended without touching
  // the mechanism itself: Service Points (`/wallet/service-points`,
  // `wallet:service-point:manage`) and Reconciliation
  // (`/wallet/reconciliation`, `wallet:reconciliation:run`). This is now
  // the FINAL shape of this dropdown — no more Wallet children are planned.
  {
    href: "/wallet",
    labelKey: "wallet",
    icon: WalletCards,
    allowedRoles: [],
    children: [
      { href: "/wallet", labelKey: "walletWallets" },
      { href: "/wallet/service-points", labelKey: "walletServicePoints" },
      { href: "/wallet/reconciliation", labelKey: "walletReconciliation" },
    ],
  },
  // Phase 6 Slice 17 Part 1 (Accounting Core foundations, Module 7) —
  // Accounting's first nav entries (`accounting/*` — Chart of Accounts,
  // Fiscal Years/Periods, Cost Centers — had NO home in the flat nav at all
  // before this pass, despite the backend itself being complete since Phase
  // 5, 2026-07-17). Positioned after Wallet and before Communications,
  // matching this file's own established ordering of backend-complete-
  // module dropdowns by the order each module's frontend actually shipped
  // (Wallet: Slice 11; this: Slice 17; Communications: Slice 15 — Comms
  // shipped its OWN nav entry earlier chronologically, but the plan for
  // this slice explicitly calls out "after Wallet, before Communications"
  // as this entry's position, so that's followed exactly rather than
  // appending at the end). Styled as a `children`-bearing dropdown FROM THE
  // START (the same mechanism Billing/Wallet/Comms/Users/Settings already
  // established), all 3 children shipping together in this one part (unlike
  // those other dropdowns' own incremental multi-part history) since this
  // part's own scope covers all three sub-domains at once — Journals/
  // Budgets/Integrity Sweep (the rest of Module 7's backend surface) are
  // explicitly NOT part of this dropdown yet, a future part's own scope.
  // `Landmark` (confirmed not already used elsewhere in this file, via
  // `lucide-react` — this package does export it; a bank/institution glyph,
  // a clear semantic fit for "Accounting" distinct from `Wallet`/
  // `WalletCards`/`Receipt`, all already claimed by other entries above).
  // Same `allowedRoles: []`/`<QueryBoundary>`-is-the-real-gate reasoning as
  // every other entry above: `accounting:account:view`/
  // `accounting:fiscal-year:view`/`accounting:cost-center:view` are the real
  // permissions gating each of the 3 children, no permission-list endpoint
  // exists to target them precisely from a coarse role-name check.
  //
  // Phase 6 Slice 17 Part 2 (Journals) — 4th child appended without touching
  // the mechanism itself: Journals (`/accounting/journals`,
  // `accounting:journal:view` gating list/detail, `accounting:journal:post`
  // gating the create-entry page and Reverse action). Same
  // `allowedRoles: []`/`<QueryBoundary>`-is-the-real-gate reasoning as every
  // other entry above. Not necessarily this dropdown's final shape —
  // Budgets/Integrity Sweep (the rest of Module 7's backend surface) may
  // still append further children in a future part.
  //
  // Phase 6 Slice 17 Part 3 (Budgets) — 5th child appended without touching
  // the mechanism itself: Budgets (`/accounting/budgets`,
  // `accounting:budget:manage` gating list/detail/create/lines,
  // `accounting:budget:submit` gating the submit-for-approval action). Same
  // `allowedRoles: []`/`<QueryBoundary>`-is-the-real-gate reasoning as every
  // other entry above. Still not necessarily this dropdown's final shape —
  // the Integrity Sweep (the last of Module 7's backend surface) may still
  // append one more child in a future part.
  //
  // Phase 6 Slice 17 Part 4 (FINAL shape of this dropdown) — 6th and last
  // child appended without touching the mechanism itself: Integrity Sweep
  // (`/accounting/integrity-sweep`, `accounting:integrity-sweep:run` — the
  // ONLY permission `IntegritySweepController` has, gating both its list and
  // run routes, confirmed by reading it directly). Same `allowedRoles: []`/
  // `<QueryBoundary>`-is-the-real-gate reasoning as every other entry above.
  // This completes Module 7's whole backend surface (Chart of Accounts,
  // Fiscal Years/Periods, Cost Centers, Journals, Budgets, Integrity Sweep)
  // — matching the same "FINAL shape, no more children planned" declaration
  // Billing's/Wallet's/Settings' own dropdowns already make once their own
  // last part ships.
  {
    href: "/accounting/accounts",
    labelKey: "accounting",
    icon: Landmark,
    allowedRoles: [],
    children: [
      { href: "/accounting/accounts", labelKey: "accountingAccounts" },
      { href: "/accounting/fiscal-years", labelKey: "accountingFiscalYears" },
      { href: "/accounting/cost-centers", labelKey: "accountingCostCenters" },
      { href: "/accounting/journals", labelKey: "accountingJournals" },
      { href: "/accounting/budgets", labelKey: "accountingBudgets" },
      { href: "/accounting/integrity-sweep", labelKey: "accountingIntegritySweep" },
    ],
  },
  // Phase 6 Slice 18 Part 1 (Procurement, Module 12) — Procurement's first
  // nav entry (`procurement/suppliers` — Module 12 had NO home in the flat
  // nav at all before this pass). Positioned after Accounting and before
  // Communications, per this part's own plan — matching this file's own
  // established ordering of backend-complete-module dropdowns by the order
  // each module's frontend actually shipped (Accounting: Slice 17; this:
  // Slice 18). Styled as a `children`-bearing dropdown FROM THE START (the
  // same mechanism Billing/Wallet/Accounting/Comms/Users/Settings already
  // established), even though it has only ONE child today — Suppliers —
  // since Module 12's real backend surface (Requisitions, Purchase Orders,
  // GRNs, Supplier Invoices, Payment Vouchers) is far larger than this one
  // part's own scope, and every other multi-part dropdown in this file
  // (Billing/Wallet/Accounting/Comms) already established "ship the
  // mechanism with 1 child now, append more as later parts land" as the
  // correct pattern rather than a flat leaf link that would need converting
  // later. `Truck` (confirmed not already used elsewhere in this file, via
  // `lucide-react` — this package does export it; a delivery/logistics
  // glyph, a clear semantic fit for "Procurement" distinct from
  // `Wallet`/`WalletCards`/`Receipt`/`Landmark`, all already claimed by
  // other entries above). Same `allowedRoles: []`/`<QueryBoundary>`-is-the-
  // real-gate reasoning as every other entry above:
  // `procurement:supplier:view` is the real permission gating this part's
  // one child, no permission-list endpoint exists to target it precisely
  // from a coarse role-name check.
  //
  // Phase 6 Slice 18 Part 2 — 2nd child appended without touching the
  // mechanism itself: Requisitions (`/procurement/requisitions`,
  // `procurement:requisition:view` gating list/detail,
  // `procurement:requisition:create` gating create/lines/cancel,
  // `procurement:requisition:submit` gating submit,
  // `procurement:requisition:decide` gating approve/reject). Same
  // `allowedRoles: []`/`<QueryBoundary>`-is-the-real-gate reasoning as every
  // other entry above. Still not necessarily this dropdown's final shape —
  // Purchase Orders/GRNs/Supplier Invoices/Payment Vouchers (the rest of
  // Module 12's backend surface) may still append further children in a
  // future part.
  //
  // Phase 6 Slice 18 Part 3 — 3rd child appended without touching the
  // mechanism itself: Purchase Orders (`/procurement/purchase-orders`,
  // `procurement:po:create` gating every route including the GETs — no
  // separate view permission exists, confirmed by reading
  // `PurchaseOrdersController` directly). Same `allowedRoles: []`/
  // `<QueryBoundary>`-is-the-real-gate reasoning as every other entry above.
  // **Quotations deliberately does NOT get its own nav child** —
  // `QuotationsController_list` requires a real `requisitionId` query param
  // (no "list every quotation" route exists at all), so a top-level nav
  // entry would have nowhere meaningful to land; the real entry point is
  // `requisitions/[id]/page.tsx`'s own new "View quotations" action, and
  // `procurement/quotations/page.tsx` itself offers a requisition picker for
  // anyone who lands there without a query param (see that route's own doc
  // comment). Still not necessarily this dropdown's final shape — GRNs/
  // Supplier Invoices/Payment Vouchers (the rest of Module 12's backend
  // surface) may still append further children in a future part.
  //
  // Phase 6 Slice 18 Part 4 — 4th child appended without touching the
  // mechanism itself: Supplier Invoices (`/procurement/supplier-invoices`,
  // `procurement:supplier-invoice:manage` gating list/detail/capture/post,
  // `procurement:supplier-invoice:match` gating match/resolve-exception).
  // **GRN deliberately does NOT get its own nav child either** — same class
  // of reasoning as Quotations above: `GrnController_list`'s `poId` query
  // param is genuinely required (no "list every GRN" route exists at all),
  // so a top-level nav entry would have nowhere meaningful to land; the real
  // entry point is `purchase-orders/[id]/page.tsx`'s own new
  // `<ReceiveGrnDialog>`/GRN-history card (see `grn.api.ts`'s own doc
  // comment for the full reasoning — unlike Quotations, GRN doesn't even get
  // a standalone route with a picker fallback, since a GRN is meaningless
  // without the PO context it was received against). Still not necessarily
  // this dropdown's final shape — Payment Vouchers (the last of Module 12's
  // backend surface) may still append one more child in a future part.
  //
  // Phase 6 Slice 18 Part 5 (FINAL shape of this dropdown) — 5th and 6th
  // children appended without touching the mechanism itself: Payment
  // Vouchers (`/procurement/payment-vouchers`,
  // `procurement:payment-voucher:manage` gating list/detail/create/submit/
  // approve/reject, `procurement:payment-voucher:execute` gating the
  // SEPARATE execute action — never client-side hidden here either, same
  // reasoning as `procurement:po:create-direct` above) and Contracts
  // (`/procurement/contracts`, `procurement:contract:manage` — ONE bundled
  // permission gating every route including the GETs, the same
  // no-separate-view-permission shape Purchase Orders/Supplier Invoices
  // already established). This completes Module 12's whole backend surface
  // (Suppliers, Requisitions, Quotations, Purchase Orders, GRN, Supplier
  // Invoices, Payment Vouchers, Contracts) — matching the same "FINAL shape,
  // no more children planned" declaration Billing's/Wallet's/Settings'/
  // Accounting's own dropdowns already make once their own last part ships.
  {
    href: "/procurement/suppliers",
    labelKey: "procurement",
    icon: Truck,
    allowedRoles: [],
    children: [
      { href: "/procurement/suppliers", labelKey: "procurementSuppliers" },
      { href: "/procurement/requisitions", labelKey: "procurementRequisitions" },
      { href: "/procurement/purchase-orders", labelKey: "procurementPurchaseOrders" },
      { href: "/procurement/supplier-invoices", labelKey: "procurementSupplierInvoices" },
      { href: "/procurement/payment-vouchers", labelKey: "procurementPaymentVouchers" },
      { href: "/procurement/contracts", labelKey: "procurementContracts" },
    ],
  },
  // Phase 6 Slice 19 Part 1 (Inventory Foundations, Module 13) —
  // Inventory's first nav entry (`inventory/*` — Categories, Stores, Items —
  // had NO home in the flat nav at all before this pass, despite the
  // backend itself being complete since Phase 5, 2026-07-19). Positioned
  // AFTER the Procurement dropdown directly above and before Communications
  // below, per this part's own plan — matching this file's own established
  // ordering of backend-complete-module dropdowns by the order each
  // module's frontend actually shipped, with the two newest module
  // dropdowns (Procurement: Slice 18; this: Slice 19) kept adjacent, the
  // same "insert right after the most-recently-shipped module dropdown"
  // placement Procurement itself followed relative to Accounting in Slice
  // 18's own comment above. Styled as a `children`-bearing dropdown FROM THE
  // START (the same mechanism every other multi-part module dropdown in
  // this file already established), all 3 children shipping together in
  // this one part since this part's own scope covers Categories/Stores/
  // Items at once — Stock Movements/Transfers/Stock Takes (the rest of
  // Module 13's backend surface) are explicitly NOT part of this dropdown
  // yet, a future part's own scope. `Package` (confirmed not already used
  // elsewhere in this file, and confirmed actually exported by
  // `lucide-react` by checking that package's own compiled
  // `dist/esm/icons/package.js` file directly, not assumed — a
  // box/inventory glyph, a clear semantic fit for "Inventory" distinct from
  // `Truck`/`Landmark`/`Wallet`/`WalletCards`/`Receipt`, all already claimed
  // by other entries above). Same `allowedRoles: []`/`<QueryBoundary>`-is-
  // the-real-gate reasoning as every other entry above:
  // `inventory:category:manage`/`inventory:store:manage`/`inventory:item:view`
  // are the real permissions gating each of the 3 children (Categories/
  // Stores share one bundled `:manage` permission with no separate view
  // permission; Items splits `:view`/`:manage`, confirmed by reading all 3
  // controllers directly — see `features/inventory/api/*.ts`'s own doc
  // comments), no permission-list endpoint exists to target them precisely
  // from a coarse role-name check.
  //
  // Phase 6 Slice 19 Part 2 (Stock Movements + Transfers, Module 13) —
  // appends 2 more children (Stock Movements, Transfers) to this SAME
  // dropdown, per this part's own explicit "append-only, same pattern every
  // multi-part slice uses" instruction — mirrors Communications Part 2
  // appending Broadcasts below. Gated by `inventory:movement:view` and
  // `inventory:transfer:issue` respectively (both real, confirmed by reading
  // `StockMovementsController`/`TransfersController` directly). Still NOT
  // this dropdown's final shape — Stock Takes (the last of Module 13's
  // backend surface) may still append one more child in a future part.
  //
  // Phase 6 Slice 19 Part 3 (FINAL shape of this dropdown) — 6th and last
  // child appended without touching the mechanism itself: Stock Takes
  // (`/inventory/stock-takes`, `inventory:stock-take:create` gating
  // list/detail/lines — the same "one bundled permission reused across every
  // GET" shape Stores/Transfers already established, confirmed by reading
  // `StockTakesController` directly). This completes Module 13's whole
  // backend surface (Categories, Stores, Items, Stock Movements, Transfers,
  // Stock Takes) — matching the same "FINAL shape, no more children planned"
  // declaration Accounting's/Procurement's own dropdowns already make once
  // their own last part ships.
  {
    href: "/inventory/categories",
    labelKey: "inventory",
    icon: Package,
    allowedRoles: [],
    children: [
      { href: "/inventory/categories", labelKey: "inventoryCategories" },
      { href: "/inventory/stores", labelKey: "inventoryStores" },
      { href: "/inventory/items", labelKey: "inventoryItems" },
      { href: "/inventory/stock-movements", labelKey: "inventoryStockMovements" },
      { href: "/inventory/transfers", labelKey: "inventoryTransfers" },
      { href: "/inventory/stock-takes", labelKey: "inventoryStockTakes" },
    ],
  },
  // Phase 6 Slice 20 Part 1 (Expenses Foundations, Module 14) — Expenses'
  // first nav entry (`expenses/*` — Categories, Expense Vouchers — had NO
  // home in the flat nav at all before this pass, despite the backend itself
  // being complete since Phase 5, 2026-07-19). Positioned AFTER the Inventory
  // dropdown directly above and before Communications below, per this part's
  // own plan — matching this file's own established ordering of
  // backend-complete-module dropdowns by the order each module's frontend
  // actually shipped, with the two newest module dropdowns (Inventory: Slice
  // 19; this: Slice 20) kept adjacent, the same "insert right after the
  // most-recently-shipped module dropdown" placement Inventory itself
  // followed relative to Procurement in Slice 19's own comment above. Styled
  // as a `children`-bearing dropdown FROM THE START (the same mechanism every
  // other multi-part module dropdown in this file already established), with
  // 2 children (Categories, Vouchers) shipping together in this one part —
  // Petty Cash, Staff Claims, and Recurring Templates (the rest of Module
  // 14's real backend surface, confirmed present in
  // `packages/server/src/domains/expenses/api/` — `petty-cash.controller.ts`/
  // `claims.controller.ts`/`recurring.controller.ts`) are explicitly NOT part
  // of this dropdown yet, a future part's own scope. `CreditCard` (confirmed
  // not already used elsewhere in this file — `Receipt`/`Wallet`/`WalletCards`
  // are already claimed by Billing/Payments/Wallet respectively, per this
  // part's own task brief warning; `CreditCard` is a clear semantic fit for
  // Expenses' own payment-method-driven vouchers,
  // `CASH`/`BANK`/`PETTY_CASH`/`MPESA`/`CHEQUE`). Same `allowedRoles: []`/
  // `<QueryBoundary>`-is-the-real-gate reasoning as every other entry above:
  // `expenses:category:manage`/`expenses:voucher:create` are the real
  // permissions gating each of the 2 children (confirmed by reading
  // `CategoriesController`/`VouchersController` directly — Categories shares
  // one bundled `:manage` permission with no separate view permission,
  // exactly like Inventory's own Categories; Vouchers reuses its own
  // `:create` permission across every GET too, no separate view permission
  // either), no permission-list endpoint exists to target them precisely
  // from a coarse role-name check.
  //
  // Phase 6 Slice 20 Part 2 (Petty Cash, Module 14) — 3rd child appended
  // without touching the mechanism itself: Petty Cash (`/expenses/petty-cash`,
  // `expenses:petty-cash:manage` gating the float list/detail/create/ceiling-
  // update/spend-and-replenishment history screens — the SAME real permission
  // `PettyCashController` uses for those routes; the narrower
  // `expenses:petty-cash:spend`/`:replenish-request`/`:replenish-decide`/
  // `:replenish-execute` permissions gate the individual action buttons
  // WITHIN that screen, not the nav entry itself, confirmed by reading
  // `PettyCashController` directly — 5 distinct permissions on one
  // controller, more granular than this dropdown's other 2 children). Still
  // NOT this dropdown's final shape — Staff Claims/Recurring Templates (the
  // rest of Module 14's real backend surface, confirmed present in
  // `packages/server/src/domains/expenses/api/{claims,recurring}.controller.ts`)
  // may still append further children in a future part.
  //
  // Phase 6 Slice 20 Part 3 (Staff Claims, Module 14) — 4th child appended
  // without touching the mechanism itself: Claims (`/expenses/claims`,
  // `expenses:claim:create` gating the list/detail/line-mutation screens —
  // the SAME real permission `ClaimsController` bundles across every GET and
  // every DRAFT-only line mutation, confirmed by reading it directly; the
  // narrower `expenses:claim:submit`/`:decide`/`:reimburse` permissions gate
  // the individual status-action buttons WITHIN the detail screen, not the
  // nav entry itself — the same "coarse nav gate, granular in-screen gates"
  // shape Petty Cash's own comment above already establishes for its 5
  // distinct permissions). Still NOT necessarily this dropdown's final shape
  // — Recurring Templates (the last of Module 14's real backend surface,
  // confirmed present in `packages/server/src/domains/expenses/api/recurring.controller.ts`)
  // may still append one more child in a future part.
  //
  // Phase 6 Slice 20 Part 4 (FINAL shape of this dropdown) — 5th and last
  // child appended without touching the mechanism itself: Recurring
  // (`/expenses/recurring`, `expenses:recurring:manage` gating the
  // list/detail/create/edit screens — the SAME real permission
  // `RecurringController` bundles across every GET and CRUD route, confirmed
  // by reading it directly; the separate `expenses:recurring:run` permission
  // gates ONLY the "Run Due Templates" action within the list screen — the
  // same "coarse nav gate, granular in-screen gates" shape Petty Cash's/
  // Claims' own comments above already establish). This completes Module
  // 14's whole backend surface (Categories, Expense Vouchers, Petty Cash,
  // Staff Claims, Recurring Templates) — matching the same "FINAL shape, no
  // more children planned" declaration Accounting's/Procurement's/
  // Inventory's own dropdowns already make once their own last part ships.
  {
    href: "/expenses/categories",
    labelKey: "expenses",
    icon: CreditCard,
    allowedRoles: [],
    children: [
      { href: "/expenses/categories", labelKey: "expensesCategories" },
      { href: "/expenses/vouchers", labelKey: "expensesVouchers" },
      { href: "/expenses/petty-cash", labelKey: "expensesPettyCash" },
      { href: "/expenses/claims", labelKey: "expensesClaims" },
      { href: "/expenses/recurring", labelKey: "expensesRecurring" },
    ],
  },
  // Phase 6 Slice 21 Part 1 (Banking, Module 16) — Banking's first nav entry
  // (`banking/*` — Accounts — had NO home in the flat nav at all before this
  // pass, despite the backend itself being complete since Phase 5,
  // 2026-07-20; only a minimal read-only picker existed pre-this-part,
  // `features/payments/components/bank-account-select.tsx`, consumed by
  // Payments' own receipt-capture screen, and that component has no nav entry
  // of its own — it's embedded inline in a form). Positioned AFTER the
  // Expenses dropdown directly above and before Communications below, per
  // this part's own plan — matching this file's own established ordering of
  // backend-complete-module dropdowns by the order each module's frontend
  // actually shipped, with the two newest module dropdowns (Expenses: Slice
  // 20; this: Slice 21) kept adjacent, the same "insert right after the
  // most-recently-shipped module dropdown" placement Expenses itself followed
  // relative to Inventory in Slice 20's own comment above. Styled as a
  // `children`-bearing dropdown FROM THE START (the same mechanism every
  // other multi-part module dropdown in this file already established), even
  // though it has only ONE child today — Accounts — since Module 16's real
  // backend surface (Transfers, Deposits/Withdrawals, Cheque Books/Leaves,
  // Statement Import, Reconciliation — all confirmed present under
  // `packages/server/src/domains/banking/api/`) is far larger than this
  // part's own scope, the same "ship the mechanism with 1 child now, append
  // more as later parts land" pattern Procurement/Inventory/Expenses' own
  // Part 1s already established rather than a flat leaf link that would need
  // converting later. `Banknote` (confirmed not already used elsewhere in
  // this file, and confirmed actually exported by `lucide-react` — `Landmark`
  // was already claimed by Accounting above, per this part's own task brief
  // warning; `Wallet`/`WalletCards`/`Receipt`/`Truck`/`Package`/`CreditCard`
  // are likewise already claimed by Payments/Wallet/Billing/Procurement/
  // Inventory/Expenses respectively — `Banknote` is a clear semantic fit for
  // Banking's own cash/bank-account register distinct from all of those).
  // Same `allowedRoles: []`/`<QueryBoundary>`-is-the-real-gate reasoning as
  // every other entry above — with a real wrinkle worth stating plainly:
  // `banking:account:manage` is the ONE shared permission gating ALL 4 routes
  // on `AccountsController`, including the LIST route itself (confirmed by
  // reading it directly — there is no separate read-only view permission for
  // bank accounts at all), so most non-admin roles will see this nav entry
  // but hit a real 403 once `/banking/accounts` itself loads — the same
  // `<QueryBoundary>`-is-the-real-gate shape every other entry in this file
  // already relies on, just with a narrower-than-usual set of roles that
  // actually clear it.
  //
  // Phase 6 Slice 21 Part 2 — 2nd, 3rd, and 4th children appended without
  // touching the mechanism itself: Transfers (`/banking/transfers`,
  // `banking:transfer:create` gating list/detail/submit — the same
  // "LIST/GET share the CREATE permission, no separate view permission"
  // shape Accounts' own Part 1 comment above already established, confirmed
  // by reading `TransfersController` directly), Deposits
  // (`/banking/deposits`, `banking:deposit:create`), and Withdrawals
  // (`/banking/withdrawals`, `banking:withdrawal:create`) — the rest of
  // Module 16's real backend surface confirmed present under
  // `packages/server/src/domains/banking/api/` (`transfers.controller.ts`/
  // `deposits.controller.ts`/`withdrawals.controller.ts`). Still NOT this
  // dropdown's final shape — Cheque Books/Leaves, Statement Import, and
  // Reconciliation may still append further children in a future part.
  //
  // Phase 6 Slice 21 Part 3 — 5th child appended: Statement Import
  // (`/banking/statement-imports`, `banking:statement:import` gating
  // list/detail/import — the SAME "LIST/GET share the one CREATE-shaped
  // permission" shape every other child in this dropdown already
  // establishes, confirmed by reading `StatementImportController` directly).
  // Still NOT this dropdown's final shape — Cheque Books/Leaves and
  // Reconciliation may still append further children in a future part.
  //
  // Phase 6 Slice 21 Part 4 — 6th child appended without touching the
  // mechanism itself: Reconciliation (`/banking/reconciliations`,
  // `banking:reconciliation:manage` gating start/list/detail/matches/
  // auto-match/manual-match/adjustments/lock — the SAME "LIST/GET share the
  // one manage-shaped permission" shape every other child in this dropdown
  // already establishes; `reopen` alone needs the separate, more-privileged
  // `banking:reconciliation:reopen`, confirmed by reading
  // `ReconciliationController` directly — never client-side hidden here
  // either, same reasoning `procurement:po:create-direct`/
  // `procurement:payment-voucher:execute` above already established for
  // their own narrower action-level permissions). Still NOT this dropdown's
  // final shape — Cheque Books/Leaves (the last of Module 16's real backend
  // surface) may still append one more child in a future part.
  //
  // Phase 6 Slice 21 Part 5 — 7th and 8th (FINAL) children appended: Cheque
  // Books (`/banking/cheque-books`, `banking:cheque-book:manage` gating all
  // 3 routes including LIST, the same "one shared manage-shaped permission"
  // shape every other child in this dropdown already establishes) and
  // Cheque Leaves (`/banking/cheque-leaves`, `banking:cheque-leaf:manage`
  // gating list/detail/mark-presented/mark-cleared/stop/cancel/flag-stale;
  // `issueNext` alone needs the separate `banking:cheque-leaf:issue`,
  // confirmed by reading `ChequeLeavesController` directly — the SAME
  // privilege-separation shape `banking:reconciliation:{manage,reopen}`
  // (Part 4) already established, just with the narrower permission gating
  // the ACTION and the broader one gating everything else, the mirror image
  // of Reconciliation's own split — never client-side hidden here either,
  // same reasoning as every other narrower action-level permission above).
  // **THIS IS THE BANKING DROPDOWN'S FINAL SHAPE — 8 children, no more
  // planned.** Module 16 (Banking)'s entire real backend surface confirmed
  // present under `packages/server/src/domains/banking/api/` (Accounts,
  // Transfers, Deposits, Withdrawals, Statement Import, Reconciliation,
  // Cheque Books, Cheque Leaves) now has a real, working, verified frontend
  // screen reachable from this one completed dropdown — the same "FINAL
  // shape, no more planned" closure Expenses' own 5-child dropdown (Slice 20
  // Part 4) already declared for its own module.
  {
    href: "/banking/accounts",
    labelKey: "banking",
    icon: Banknote,
    allowedRoles: [],
    children: [
      { href: "/banking/accounts", labelKey: "bankingAccounts" },
      { href: "/banking/transfers", labelKey: "bankingTransfers" },
      { href: "/banking/deposits", labelKey: "bankingDeposits" },
      { href: "/banking/withdrawals", labelKey: "bankingWithdrawals" },
      { href: "/banking/statement-imports", labelKey: "bankingStatementImports" },
      { href: "/banking/reconciliations", labelKey: "bankingReconciliations" },
      { href: "/banking/cheque-books", labelKey: "bankingChequeBooks" },
      { href: "/banking/cheque-leaves", labelKey: "bankingChequeLeaves" },
    ],
  },
  // Phase 6 Slice 22 Part 1 (Payroll foundations, Module 15) — Payroll's
  // first nav entry (`payroll` had NO home in the flat nav at all before this
  // pass, despite `packages/server/src/domains/payroll/` already carrying a
  // large real backend surface: employees, components, salary structures,
  // assignments, loans, one-offs, statutory tables, runs). Positioned
  // immediately after Banking (the last ERP-finance module before
  // Communications) and before Communications, per this part's own plan —
  // confirmed by reading this file's own actual current order directly:
  // Billing, Wallet, Accounting, Procurement, Inventory, Expenses, Banking,
  // Communications, Users, Settings. `HandCoins` (confirmed not already used
  // elsewhere in this file via `lucide-react` — this package does export it)
  // is a semantically fitting icon for a payroll module, distinct from
  // `Wallet`/`Banknote`/`CreditCard` already used by other top-level entries.
  //
  // Styled as a `children`-bearing dropdown FROM THE START (the same
  // mechanism every other multi-screen module in this file already
  // establishes), but this is NOT this dropdown's final shape — only TWO
  // children exist so far (Employees, Components); 5 more parts append the
  // rest of Module 15's real backend surface (salary structures/assignments,
  // loans, one-offs, statutory tables, runs) in later parts, the same
  // incremental-append discipline Banking's/Communications' own nav history
  // already established (a part ships real, working children only, never a
  // stub route ahead of its own part's work).
  //
  // Same `allowedRoles: []`/`<QueryBoundary>`-is-the-real-gate reasoning as
  // every other entry above: `payroll:employee:view`/`payroll:component:manage`
  // are the real permissions gating these two children respectively, no
  // permission-list endpoint exists to target either precisely from a coarse
  // role-name check.
  //
  // Phase 6 Slice 22 Part 2 (Salary Structures) — 3rd child appended without
  // touching the mechanism itself: Salary Structures
  // (`/payroll/salary-structures`, `payroll:structure:manage` — the ONE
  // shared permission gating ALL 8 routes on `SalaryStructuresController`,
  // including both LIST routes, confirmed by reading it directly — same
  // "no separate view code" shape `payrollComponents` above already
  // established). Still NOT this dropdown's final shape — Employee
  // Assignments (Part 3, next) + Employee Components, Loans, One-offs,
  // Statutory Tables, and Payroll Runs (the rest of Module 15's real backend
  // surface) will still append further children in future parts.
  //
  // Phase 6 Slice 22 Part 3 (Employee Assignments + Employee Components) —
  // NO nav child appended: both `EmployeeAssignmentsController`/
  // `EmployeeComponentsController` only ever list scoped to one
  // `employeeId` (confirmed by reading both directly), so neither has a real
  // "list every assignment/override across every employee" screen to back a
  // top-level route — that part's work lives entirely on the existing
  // employee detail page instead. Still NOT this dropdown's final shape —
  // Loans, One-offs, and Payroll Runs (the rest of Module 15's real backend
  // surface) will still append further children in future parts.
  //
  // Phase 6 Slice 22 Part 4 (Statutory Tables) — 4th child appended without
  // touching the mechanism itself: Statutory Tables
  // (`/payroll/statutory-tables`, `payroll:statutory-table:manage` — the ONE
  // shared permission gating ALL 5 routes on `StatutoryTablesController`,
  // including both LIST-shaped routes (`listByKind`/`findEffectiveFor`), no
  // separate view code, no DELETE route at all — confirmed by reading it
  // directly, 71 lines). Still NOT this dropdown's final shape — Loans,
  // One-offs, and Payroll Runs (the rest of Module 15's real backend
  // surface) will still append further children in future parts.
  //
  // Phase 6 Slice 22 Part 5 (Loans) — 5th child appended without touching
  // the mechanism itself: Loans (`/payroll/loans`, `payroll:loan:create` —
  // the SAME permission reused for every read route on `LoansController`,
  // no dedicated `:view` code exists at all, confirmed by reading the
  // controller's own doc comment directly: a deliberate "reuse the nearest
  // one" precedent, the same shape `PurchaseOrdersController` already
  // established; the narrower `payroll:loan:decide` gates the 3
  // approve/reject/record-recovery/settle-early write actions WITHIN the
  // detail page, not this nav entry itself — the same "coarse nav gate,
  // granular in-screen gates" shape Expenses'/Banking's own dropdowns
  // already establish for their own narrower action-level permissions).
  // Still NOT this dropdown's final shape — One-offs and Payroll Runs (the
  // rest of Module 15's real backend surface) will still append further
  // children in future parts.
  //
  // Phase 6 Slice 22 Part 6 (Payroll Runs, setup through approval) — 6th
  // child appended without touching the mechanism itself: Payroll Runs
  // (`/payroll/runs`, `payroll:run:view` — a real, DEDICATED read
  // permission, unlike Loans' own reused-create-permission shape, confirmed
  // by reading `PayrollRunsController` directly). **One-offs deliberately do
  // NOT get their own nav child** — per this part's own task brief, a
  // one-off is period-scoped and most useful managed directly from a run's
  // own detail page (`run-oneoffs-panel.tsx`), the same "no standalone route
  // needed when properly scoped elsewhere" judgment call Part 3 already made
  // for assignments/overrides.
  //
  // Phase 6 Slice 22 Part 7 (Payroll Runs, commit through file + payslip
  // view — FINAL shape of this dropdown, and of Module 15's whole frontend)
  // — NO nav child appended, confirmed as this part's own explicit call, not
  // an oversight: `commit`/`pay`/`file` are new ACTIONS on the SAME
  // `/payroll/runs/[id]` detail page Part 6 already built (own new buttons
  // in `run-status-actions.tsx` + a real `<PayRunDialog>` for `pay()`'s own
  // method selector), and the new payslip view
  // (`/payroll/runs/[id]/lines/[lineId]`) is reached by clicking "View
  // payslip" on a specific row of that same page's own `<RunLinesTable>`,
  // never from the nav — a payslip is scoped to one specific run+employee
  // line, exactly the same "no standalone top-level route when properly
  // reached from its own parent screen" judgment call Part 3's own
  // assignment/override panels and Part 6's own one-offs panel already
  // established. **THIS IS THE PAYROLL DROPDOWN'S FINAL SHAPE — 6 children,
  // no more planned** — Module 15 (Payroll)'s entire real backend surface
  // (Employees, Components, Salary Structures, Employee Assignments +
  // Component Overrides, Statutory Tables, Loans, and now the full Payroll
  // Runs lifecycle create -> compute -> review -> submit -> decide -> commit
  // -> pay -> file, plus the payslip view) now has a real, working, verified
  // frontend screen reachable from this one completed dropdown, matching
  // the same "FINAL shape, no more planned" closure Banking's own 8-child
  // dropdown (Slice 21 Part 5) already declared for its own module.
  {
    href: "/payroll/employees",
    labelKey: "payroll",
    icon: HandCoins,
    allowedRoles: [],
    children: [
      { href: "/payroll/employees", labelKey: "payrollEmployees" },
      { href: "/payroll/components", labelKey: "payrollComponents" },
      { href: "/payroll/salary-structures", labelKey: "payrollSalaryStructures" },
      { href: "/payroll/statutory-tables", labelKey: "payrollStatutoryTables" },
      { href: "/payroll/loans", labelKey: "payrollLoans" },
      { href: "/payroll/runs", labelKey: "payrollRuns" },
    ],
  },
  // Phase 6 Slice 23 Part 1 (Fixed Assets foundations, Module 17) — a new
  // Fixed Assets dropdown (`Boxes` icon — confirmed not already imported in
  // this file, via `lucide-react`, this package does export it) inserted
  // immediately after Payroll's own closing `},` above and before
  // Communications' own comment below, per this part's own plan — confirmed
  // against the file's real current top-level order (…Banking, Payroll,
  // Communications, Users, Settings) before inserting, not assumed. 2
  // children to start (Categories, Assets); explicitly NOT this dropdown's
  // final shape — 4 more parts (Transfers, Maintenance, Depreciation Runs,
  // Disposals, Verification — likely 5 more children total) will append the
  // rest of Module 17's real backend surface. Same `allowedRoles: []`/
  // `<QueryBoundary>`-is-the-real-gate reasoning as every other entry here:
  // `fixed-assets:category:manage`/`fixed-assets:asset:view` are the real
  // permissions gating these 2 children, no permission-list endpoint exists
  // to target either precisely from a coarse role-name check.
  //
  // Phase 6 Slice 23 Part 2 (Transfers + Maintenance) — NO nav child
  // appended, confirmed as this part's own explicit call, not an oversight:
  // both `TransfersController`/`MaintenanceController` only ever list scoped
  // to one `assetId` (confirmed by reading both directly — `GET
  // .../asset/:assetId`, no global "list every transfer/maintenance event
  // across every asset" route exists on either), so neither has a real
  // "list every X across every asset" screen to back a top-level route —
  // this part's work lives entirely on the existing asset detail page
  // instead (`<TransferPanel>`/`<MaintenancePanel>`), the exact same
  // judgment call Payroll Slice 22 Part 3 already made for its own two
  // employee-scoped features (Employee Assignments + Employee Components).
  // Still NOT this dropdown's final shape — Depreciation Runs, Disposals,
  // and Verification (the rest of Module 17's real backend surface) will
  // still append further children in future parts.
  //
  // Phase 6 Slice 23 Part 3 (Depreciation Runs) — 3rd child appended without
  // touching the mechanism itself: Depreciation Runs
  // (`/fixed-assets/depreciation-runs`, `fixed-assets:depreciation:run`
  // gating list/detail/lines/create/submit — the SAME permission bundled
  // across every read AND the create/submit writes, confirmed by reading
  // `DepreciationRunsController` directly; `decide`/`post` each need their
  // own genuinely separate, narrower permissions
  // (`fixed-assets:depreciation:decide`/`:post`) gating those two specific
  // actions WITHIN the detail page, not this nav entry itself — the same
  // "coarse nav gate, granular in-screen gates" shape every other
  // multi-permission dropdown child in this file already establishes). Still
  // NOT this dropdown's final shape — Disposals and Verification (the rest
  // of Module 17's real backend surface) will still append further children
  // in future parts.
  //
  // Phase 6 Slice 23 Part 4 (Disposals) — 4th child appended, same mechanism
  // again: Disposals (`/fixed-assets/disposals`,
  // `fixed-assets:disposal:create` gating list/detail/create/submit — ONE
  // shared permission across all 4, genuinely different from Depreciation
  // Runs' 3-way split above, confirmed by reading `DisposalController`
  // directly; `decide`/`post` each get their own separate, narrower
  // permissions gating those two actions within the detail page, not this
  // nav entry, same "coarse nav gate, granular in-screen gates" shape). Still
  // NOT this dropdown's final shape — Verification (Part 5, the slice's last
  // part) will append the 5th and final child.
  //
  // Phase 6 Slice 23 Part 5 (Verification) — 5th and FINAL child appended:
  // Verification (`/fixed-assets/verifications`,
  // `fixed-assets:verification:create` gating list/detail/lines/create/
  // submit — 4 of this route's 6 real routes; `:count`/`:decide`/`:post`
  // each get their own separate, narrower permissions gating those actions
  // within the detail page, not this nav entry, the same "coarse nav gate,
  // granular in-screen gates" shape every other multi-permission dropdown
  // child in this file already establishes). **THIS IS THE FIXED ASSETS
  // DROPDOWN'S FINAL SHAPE — 5 children total (Categories, Assets,
  // Depreciation Runs, Disposals, Verification) — no more are planned**,
  // the same "last part declares final shape" convention Banking's own
  // 8-child dropdown and Payroll's own 6-child dropdown already used at the
  // close of their respective slices.
  {
    href: "/fixed-assets/categories",
    labelKey: "fixedAssets",
    icon: Boxes,
    allowedRoles: [],
    children: [
      { href: "/fixed-assets/categories", labelKey: "fixedAssetsCategories" },
      { href: "/fixed-assets/assets", labelKey: "fixedAssetsAssets" },
      { href: "/fixed-assets/depreciation-runs", labelKey: "fixedAssetsDepreciationRuns" },
      { href: "/fixed-assets/disposals", labelKey: "fixedAssetsDisposals" },
      { href: "/fixed-assets/verifications", labelKey: "fixedAssetsVerifications" },
    ],
  },
  // Phase 6 Slice 15 Part 1 (Communications Foundation + Templates, Module
  // 5) — Comms' first nav entry (`platform/comms` had NO home in the flat
  // nav at all before this pass). Positioned between Wallet and Users, per
  // this part's own plan. Styled as a `children`-bearing dropdown FROM THE
  // START (the same mechanism Billing/Wallet/Users already established),
  // but this is NOT this dropdown's final shape — only ONE child exists so
  // far (Templates); Part 2 appends Broadcasts, then Part 3 appends the
  // remaining three (Messages, Optouts, Trigger Bindings) and reaches this
  // dropdown's FINAL shape — see Part 3's own comment below (My Devices,
  // Part 4, deliberately does NOT land here; it lives under the user menu
  // instead). The exact same incremental-append discipline Billing's/
  // Wallet's/Users' own nav history already established (a part ships one
  // real, working child, never a placeholder route) — no stub children are
  // added ahead of their own parts' work. `Megaphone` (confirmed not
  // already used elsewhere in this
  // file, via `lucide-react` — this package does export it). Same
  // `allowedRoles: []`/`<QueryBoundary>`-is-the-real-gate reasoning as every
  // other entry above: `comms:template:view` is the real permission gating
  // this part's one child, no permission-list endpoint exists to target it
  // precisely from a coarse role-name check.
  //
  // Phase 6 Slice 15 Part 2 — 2nd child appended without touching the
  // mechanism itself: Broadcasts (`/communications/broadcasts`,
  // `comms:broadcast:view`). Still NOT this dropdown's final shape — Part 3
  // (Messages/Optouts, Trigger Bindings) appends the remaining children
  // below.
  //
  // Phase 6 Slice 15 Part 3 (FINAL shape of this dropdown) — 3rd, 4th, and
  // 5th children appended in one part, per this part's own plan grouping:
  // Messages (`/communications/messages`, `comms:message:view` — a
  // READ-ONLY delivery-log view, no create/edit/delete route exists for
  // `comm_message`), Optouts (`/communications/optouts`,
  // `comms:optout:manage`), and Trigger Bindings
  // (`/communications/trigger-bindings`, `comms:trigger-binding:view`/
  // `:manage`). No more Comms children are planned after this — My Devices
  // (Part 4) lives under the user menu instead, not this dropdown (per this
  // part's own plan: "no more Comms nav children are planned").
  {
    href: "/communications/templates",
    labelKey: "communications",
    icon: Megaphone,
    allowedRoles: [],
    children: [
      { href: "/communications/templates", labelKey: "commsTemplates" },
      { href: "/communications/broadcasts", labelKey: "commsBroadcasts" },
      { href: "/communications/messages", labelKey: "commsMessages" },
      { href: "/communications/optouts", labelKey: "commsOptouts" },
      { href: "/communications/trigger-bindings", labelKey: "commsTriggerBindings" },
    ],
  },
  // Phase 6 Slice 13 Part 2 — Identity/Access's first nav entry (`platform/
  // users`, the backend's "Module 1", had NO home in the flat nav at all
  // before this pass, despite the backend itself predating almost every
  // other module here). Positioned between Wallet and Settings — Settings'
  // own doc comment below declares its dropdown's shape "FINAL, no more
  // children planned" (Slice 11 Part 4), and Identity/Access is
  // conceptually distinct from Settings anyway, so it gets its own
  // top-level entry rather than becoming a 7th Settings child. `UserCog`
  // (confirmed not already used elsewhere in this file) is the icon. Same
  // `allowedRoles: []`/`<QueryBoundary>`-is-the-real-gate reasoning as every
  // other entry — `users:role:view` is the real permission gating this
  // part's one child (`/roles`), no permission-list endpoint exists to
  // target it precisely from a coarse role-name check. Styled as a
  // `children`-bearing dropdown FROM THE START even though it has only one
  // child today — Parts 3 (`usersDepartments` -> `/departments`) and 4
  // (`usersAllUsers` -> `/users`, plus the final reorder) each append one
  // more child later; this array is left trivially appendable, not built
  // out further ahead of that work.
  //
  // Phase 6 Slice 13 Part 3 — 2nd child appended without touching the
  // mechanism itself: Departments (`/departments`, `users:department:view`).
  // Ordering was left untouched there (Roles stayed first) — Part 4's own
  // scope was the final reorder, done below.
  //
  // Phase 6 Slice 13 Part 4 (FINAL shape of this dropdown) — 3rd and last
  // child appended: All Users (`/users`, `users:user:view`), and the whole
  // array reordered to `[usersAllUsers, usersRoles, usersDepartments]` (Users
  // first, for UX prominence — it's the highest-traffic screen in this
  // module). The parent item's own top-level `href` also changes here, from
  // `/roles` (Part 2's placeholder, since `/users` didn't exist yet) to
  // `/users` now that it does. **Confirmed this is the correct, established
  // convention before changing it, not guessed**: the group header below
  // renders as a plain `<button type="button">` (see `NavLinks()`'s render
  // function) that only toggles `expandedOverride` — it never renders as a
  // `<Link>` and is never itself a real navigation target, for ANY group in
  // this file (Billing/Wallet/Settings included). A group's own `href` is
  // therefore purely a stable React `key`/bookkeeping value for
  // `isActiveNavItem()`'s "is some OTHER, more specific entry a better
  // match" guard — and every existing multi-child group (`billing`'s
  // `/billing/fee-categories`, `wallet`'s `/wallet`, `settings`'s
  // `/settings/integrations`) already sets that value to its OWN FIRST
  // child's href, not an arbitrary/independent group-level route. Matching
  // that real, consistent precedent — not inventing a new convention — is
  // why this changes to `/users` (this group's new first child) rather than
  // staying `/roles` or becoming some other value.
  {
    href: "/users",
    labelKey: "users",
    icon: UserCog,
    allowedRoles: [],
    children: [
      { href: "/users", labelKey: "usersAllUsers" },
      { href: "/roles", labelKey: "usersRoles" },
      { href: "/departments", labelKey: "usersDepartments" },
    ],
  },
  // Phase 6 Slice 14 Part 1 (Branding, Module 4) — a new top-level, single
  // leaf item (no `children` dropdown — `Settings`' own doc comment below
  // declares its dropdown "FINAL shape, no more children planned" the same
  // way this codebase already respected for Users rather than reopening it,
  // and Branding's whole surface lives under one route subtree, so it
  // doesn't need the `children` mechanism at all). Positioned between Users
  // and Settings, per the approved plan. Same `allowedRoles: []`/
  // `<QueryBoundary>`-is-the-real-gate reasoning as every other entry above:
  // `branding:theme:view` is the real permission, no permission-list
  // endpoint exists to target it precisely from a coarse role-name check.
  // `Palette` (confirmed unused elsewhere in this file).
  { href: "/branding", labelKey: "branding", icon: Palette, allowedRoles: [] },
  // Phase 6 Slice 7 (Integrations settings, first Settings-area screen) —
  // same `allowedRoles: []`/`<QueryBoundary>`-is-the-real-gate reasoning as
  // every other entry above: `settings:integration:view`/`:manage` are the
  // real permissions, no permission-list endpoint exists to target them
  // precisely from a coarse role-name check.
  //
  // Phase 6 Slice 11 Part 1 — converted to a `children`-bearing group, the
  // same mechanism the Billing entry above already established (Slice 8):
  // `href` stays `/settings/integrations` as the group's stable key (the
  // real route/content of that page is completely untouched — only its nav
  // ENTRY moved, from a leaf link to a group child), with 3 new siblings —
  // Academic Calendar (`/settings/academic-calendar`), Numbering Series
  // (`/settings/numbering-series`), and Custom Fields
  // (`/settings/custom-fields`) — all real screens built this pass, not
  // placeholders. Integrations is listed FIRST (matches its historical
  // position as the original, only child before this pass).
  //
  // Phase 6 Slice 11 Part 4 — 2 more children appended without touching the
  // mechanism itself, completing the whole Slice 11 effort's LAST nav
  // change: Webhooks (`/settings/webhooks`, `integrations:webhook:view`/
  // `:manage`/`:retry`) and Accounting Sync (`/settings/accounting-sync`,
  // `integrations:sync:view`/`:test`). This is now the FINAL shape of this
  // dropdown — no more Settings children are planned.
  {
    href: "/settings/integrations",
    labelKey: "settings",
    icon: Settings,
    allowedRoles: [],
    children: [
      { href: "/settings/integrations", labelKey: "settingsIntegrations" },
      { href: "/settings/academic-calendar", labelKey: "settingsAcademicCalendar" },
      { href: "/settings/numbering-series", labelKey: "settingsNumberingSeries" },
      { href: "/settings/custom-fields", labelKey: "settingsCustomFields" },
      { href: "/settings/webhooks", labelKey: "settingsWebhooks" },
      { href: "/settings/accounting-sync", labelKey: "settingsAccountingSync" },
    ],
  },
  // Phase 6 Slice 24 (Licensing, Module 21) — a new top-level, single LEAF
  // item, same shape as `branding` above (no `children` dropdown — this
  // module has exactly one real screen: status + API call log + update
  // notices, all one page). Same `allowedRoles: []`/`<QueryBoundary>`-is-
  // the-real-gate reasoning as every other entry above: `license:status:view`
  // is the real permission, no permission-list endpoint exists to target it
  // precisely from a coarse role-name check. `ShieldCheck` (confirmed unused
  // elsewhere in this file).
  { href: "/license", labelKey: "license", icon: ShieldCheck, allowedRoles: [] },
  // Phase 6 Slice 25 (Backups/Ops, Module 20) — a new top-level, single LEAF
  // item, same shape as `license`/`branding` above (no `children` dropdown —
  // this module's whole surface is 2 tightly-linked screens, health
  // dashboard at `/ops` and the backups list/detail at `/ops/backups*`, each
  // linking to the other via its own header — not 6 independent sub-areas
  // the way Billing/Wallet/Accounting's own dropdowns needed). Inserted
  // immediately after Slice 24's own License entry — a natural "system
  // administration" pairing (License then Backups), per this slice's own
  // brief. `href` points at `/ops/backups` (the higher-traffic of the two
  // screens — filters/run/prune all live there) rather than `/ops` (the
  // health dashboard) — the same "land on the busier screen, link onward"
  // judgment call `billing`'s own dropdown made for its first child.
  // Same `allowedRoles: []`/`<QueryBoundary>`-is-the-real-gate reasoning as
  // every other entry above: `backups:run:view`/`ops:health:view` are the
  // real permissions, no permission-list endpoint exists to target either
  // precisely from a coarse role-name check. `ServerCog` (confirmed unused
  // elsewhere in this file, and confirmed actually exported by
  // `lucide-react` before adding it — a server/ops-administration glyph, a
  // clear semantic fit distinct from every icon already claimed above).
  { href: "/ops/backups", labelKey: "opsBackups", icon: ServerCog, allowedRoles: [] },
];

/**
 * Longest-prefix match, not a plain independent `startsWith` per item — with
 * two entries now sharing a path segment (`/students` and
 * `/students/classes`, item 6), a naive `pathname.startsWith(item.href)`
 * would mark BOTH active simultaneously while viewing `/students/classes`
 * (it starts with both prefixes). `nextSegmentBoundary` also guards against
 * a false-positive sibling match (`/students-archive` should not match
 * `/students`).
 */
function isActiveNavItem(pathname: string, href: string, allHrefs: readonly string[]): boolean {
  const matches = pathname === href || pathname.startsWith(`${href}/`);
  if (!matches) return false;
  const moreSpecificMatch = allHrefs.some(
    (other) => other !== href && other.length > href.length && (pathname === other || pathname.startsWith(`${other}/`)),
  );
  return !moreSpecificMatch;
}

const INACTIVE_TEXT_CLASSES =
  "text-[color-mix(in_srgb,var(--color-surface)_70%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-surface)_10%,transparent)] hover:text-brand-surface";

export function NavLinks() {
  const t = useTranslations("shell.nav");
  const pathname = usePathname();
  const accessToken = useAuthStore((s) => s.accessToken);
  const visibleItems = NAV_ITEMS.filter((item) => hasAnyRole(accessToken, item.allowedRoles));
  // Every leaf href — top-level items AND every group's children — feeds
  // `isActiveNavItem()`'s "is some OTHER, more specific entry a better
  // match" guard, exactly as it did before `children` existed (top-level
  // hrefs alone).
  const allHrefs = visibleItems.flatMap((item) => [item.href, ...(item.children?.map((c) => c.href) ?? [])]);

  // Manual expand/collapse override per group (keyed by the group's own
  // `href`) — `undefined` means "no manual toggle yet, fall back to
  // auto-expand whenever the current pathname matches one of this group's
  // children" (reuses `isActiveNavItem()`'s own prefix-matching logic, the
  // same mechanism every leaf item's active-state already relies on).
  const [expandedOverride, setExpandedOverride] = React.useState<Record<string, boolean>>({});

  return (
    <nav className="flex flex-col gap-1 px-2">
      {visibleItems.map((item) => {
        const Icon = item.icon;

        if (item.children && item.children.length > 0) {
          const childActive = item.children.some((child) => isActiveNavItem(pathname, child.href, allHrefs));
          const expanded = expandedOverride[item.href] ?? childActive;
          return (
            <div key={item.href}>
              <button
                type="button"
                onClick={() => setExpandedOverride((prev) => ({ ...prev, [item.href]: !expanded }))}
                aria-expanded={expanded}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  childActive ? "text-brand-surface" : INACTIVE_TEXT_CLASSES,
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1 text-left">{t(item.labelKey)}</span>
                <ChevronDown className={cn("size-4 shrink-0 transition-transform", expanded && "rotate-180")} />
              </button>
              {expanded && (
                <div className="ml-4 flex flex-col gap-1 border-l border-[color-mix(in_srgb,var(--color-surface)_15%,transparent)] py-1 pl-3">
                  {item.children.map((child) => {
                    const childIsActive = isActiveNavItem(pathname, child.href, allHrefs);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                          childIsActive ? "bg-brand-primaryLight text-brand-black" : INACTIVE_TEXT_CLASSES,
                        )}
                      >
                        {t(child.labelKey)}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        const active = isActiveNavItem(pathname, item.href, allHrefs);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              // Slice 1.5 (visual redesign): active state becomes a filled
              // pill (`bg-brand-primaryLight text-brand-black`) — reusing
              // the exact "on dark chrome" pairing lib/theme.ts's own
              // dark-mode variables already establish, not a new
              // invention. Inactive/hover states are ALSO switched here
              // from `text-muted-foreground`/`hover:bg-muted` (light-mode
              // tuned tokens) to `--color-surface`-based ones: the plan's
              // nav-links bullet only called out the active pill, but the
              // sidebar itself now stays dark unconditionally (judgment
              // call #1 in sidebar.tsx), so leaving inactive text on the
              // light-mode muted-foreground token would be a real
              // contrast regression, not a stylistic choice — this
              // extension stays inside the existing token system (no new
              // hex) so it's a tight, in-scope fix rather than new scope.
              // Slice 1.5b (visual polish iteration): the pill itself is now
              // a `layoutId`-shared `motion.span` (below), so `active`'s own
              // className no longer paints the fill directly — only text
              // color changes here.
              //
              // Phase 6 Slice 2b item 7 — REAL bug fix, not cosmetic: the
              // previous `text-brand-surface/70`/`hover:bg-brand-surface/10`
              // classes are Tailwind `/NN` opacity modifiers, which silently
              // no-op on this app's raw-`var(--x)`-CSS-custom-property
              // colors (the systemic limitation docs/phase-6/PROGRESS.md's
              // Slice 1.5b bug #3 already found and DELIBERATELY deferred —
              // that finding never got fixed anywhere, and THIS is the first
              // place it broke something genuinely, not just cosmetically:
              // the compiled rule for `text-brand-surface/70` was
              // `color: var(--color-surface)` with NO alpha applied at all,
              // meaning inactive nav items rendered at full white-on-dark
              // opacity — which should have been highly visible, not
              // invisible. The user's real complaint ("only visible on
              // hover") points at the SAME root defect from the opposite
              // side: `hover:bg-brand-surface/10` also silently drops its
              // alpha and paints a FULLY OPAQUE `--color-surface` bg block
              // on hover, which — combined with the inactive text ALSO
              // being full-opacity `--color-surface` (white-ish) sitting on
              // that white-ish hover block — reads as "text only becomes
              // legible on hover" purely by accident of one opaque layer
              // occluding another, not by design. Fixed narrowly for these
              // two classes with `color-mix()` (operates on the raw
              // CSS-variable color directly, sidesteps the opacity-modifier
              // limitation entirely — the exact same mechanism this file's
              // own Slice 1.5c nav-pill glow already established, see
              // below) instead of the broader app-wide RGB-triplet
              // refactor Slice 1.5b's bug #3 flagged as its own dedicated
              // pass — that broader issue stays deliberately deferred,
              // this fixes only the two classes causing THIS reported bug.
              active ? "text-brand-black" : INACTIVE_TEXT_CLASSES,
            )}
          >
            {active && (
              // Slice 1.5b (visual polish iteration): a shared `layoutId`
              // pill — when `active` moves from one <NavLinks> item to
              // another, Framer Motion animates a smooth FLIP transition
              // between the two positions instead of an instant class swap.
              // This slice ships only ONE real nav entry (dashboard — see
              // this file's own doc comment on coarse role gating), so the
              // transition has nowhere to visibly move to/from YET; the
              // mechanism is built correctly now (verified via code review
              // + the reduced-motion guard in app/providers.tsx) so it
              // animates automatically once a second real nav entry lands
              // in a future slice, matching this codebase's own established
              // "build the real mechanism now, not a fake stand-in" pattern
              // (e.g. KpiCard's `trend` prop).
              //
              // Slice 1.5c (creative sidebar shape): the pill itself gained
              // a soft `color-mix()`-derived glow (arbitrary-value shadow —
              // `color-mix()` operates on the raw CSS-variable color
              // directly, sidestepping the documented `/NN` opacity-modifier
              // limitation on this app's hex-var colors, docs/phase-6/
              // PROGRESS.md Slice 1.5b bug #3) and a small diamond accent
              // chip on its leading edge — the same "diamonds from logo"
              // motif introduced in sidebar.tsx, echoed here as the shape
              // detail near the active nav item this round's plan called
              // out. The chip is a plain child span, not its own
              // `layoutId`, so it rides along with the parent pill's FLIP
              // transition for free.
              <motion.span
                layoutId="nav-active-pill"
                className="absolute inset-0 rounded-lg bg-brand-primaryLight shadow-[0_4px_14px_-4px_color-mix(in_srgb,var(--color-primary-light)_60%,transparent)]"
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <span
                  aria-hidden
                  className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 rounded-[1px] bg-brand-accent"
                />
              </motion.span>
            )}
            <Icon className="relative z-10 size-4" />
            <span className="relative z-10">{t(item.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

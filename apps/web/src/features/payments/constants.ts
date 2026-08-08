/**
 * `PayReceiptSplitMethod`
 * (`packages/server/src/domains/payments/domain/pay-receipt-split.entity.ts`)
 * has 10 members; `@klickit/contracts` only exports the zod ENUM (a type,
 * not a runtime value list), so this array is hand-mirrored here for
 * anything that needs to iterate/render the real option set (the capture
 * form's method `<Select>`, the session-close dialog's per-method counted
 * inputs, the `splitMethods` i18n lookup).
 *
 * `WALLET` is deliberately OMITTED from this list — confirmed real, not a
 * guess: `ReceiptsService.validateSplitReferences()`'s `case "WALLET"`
 * unconditionally throws `ValidationException` ("WALLET-method payments are
 * not yet supported... Module 11 (Wallet) is not built yet") for EVERY
 * capture attempt, no exceptions — so offering it as a selectable method
 * here would only ever produce a guaranteed-failing submission. If Module 11
 * (Wallet) ever lands, this is the one line to update.
 */
export const RECEIPT_SPLIT_METHODS = [
  "CASH",
  "BANK",
  "CHEQUE",
  "CARD",
  "POS",
  "MPESA_STK",
  "MPESA_C2B",
  "MPESA_TILL",
  "BANK_TRANSFER",
] as const;

export type ReceiptSplitMethod = (typeof RECEIPT_SPLIT_METHODS)[number];

/**
 * Phase 6 Slice 5 (Approvals + receipt reversal) — `ReceiptReversalReasonCode`
 * (`packages/server/src/domains/payments/application/receipts.service.ts`),
 * mirrored the same way `RECEIPT_SPLIT_METHODS` mirrors `PayReceiptSplitMethod`
 * above: `@klickit/contracts`' `ReverseReceiptDtoSchema` only exports the zod
 * enum type, not a runtime value array, so this is hand-mirrored for the
 * execute-reversal dialog's reason `<Select>`.
 */
export const RECEIPT_REVERSAL_REASON_CODES = ["ERROR", "BOUNCE", "DUPLICATE", "FRAUD"] as const;

export type ReceiptReversalReasonCode = (typeof RECEIPT_REVERSAL_REASON_CODES)[number];

/**
 * `PAYMENT_REVERSALS_APPROVAL_DOMAIN_CODE`
 * (`packages/server/src/domains/payments/application/receipts.service.ts`) —
 * hand-mirrored as a literal string constant (not imported — `apps/web` has
 * no dependency on `packages/server`, only `@klickit/contracts`, which
 * doesn't export domain-code constants). Used both to query
 * `GET /approvals/instances?domainCode=` for a receipt's reversal status and
 * to invalidate that exact cached query after a reversal request/execute.
 */
export const PAYMENT_REVERSALS_DOMAIN_CODE = "PAYMENT_REVERSALS";

/** `pay_receipt` — `RECEIPT_ENTITY_TYPE` in `receipts.controller.ts`, mirrored here for the same reason as `PAYMENT_REVERSALS_DOMAIN_CODE` above. */
export const RECEIPT_ENTITY_TYPE = "pay_receipt";

/**
 * Phase 6 Slice 6 — `pay_suspense_item`, `SUSPENSE_ITEM_ENTITY_TYPE` in
 * `suspense.controller.ts`, mirrored here for the same reason as
 * `RECEIPT_ENTITY_TYPE` above. Suspense refund reuses the SAME
 * `PAYMENT_REVERSALS_DOMAIN_CODE` workflow as receipt reversal (confirmed by
 * reading `suspense.controller.ts`'s own doc comment — "the `0900` seed
 * registers exactly one `PAYMENT_REVERSALS` `appr_workflow_def`, not two"),
 * so no separate domain-code constant is needed here.
 */
export const SUSPENSE_ITEM_ENTITY_TYPE = "pay_suspense_item";

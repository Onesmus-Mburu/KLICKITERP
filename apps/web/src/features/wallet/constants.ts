/**
 * Phase 6 Slice 11 (Part 2) — plain string-literal constants mirroring the
 * real backend enums exactly (`WALL_WALLET_STATUSES`/`WALL_TRANSACTION_TYPES`/
 * `WALL_SERVICE_POINT_TYPES` in `packages/server/src/domains/wallet/domain/*.ts`,
 * plus the `PAY_METHODS`/`REFUND_METHODS` arrays inlined in
 * `wallet-transaction.dto.ts`) — same `features/students/constants.ts`/
 * `features/payments/constants.ts` precedent of a small local constants file
 * per feature module rather than importing the server's own arrays.
 */
export const WALLET_STATUSES = ["ACTIVE", "LOCKED", "FROZEN", "CLOSED"] as const;
export type WalletStatus = (typeof WALLET_STATUSES)[number];

/** `SetWalletStatusDto.status` deliberately excludes CLOSED — reached only via the separate `close` flow. The type predicate narrows the element type (a plain `.filter()` would keep the wider `WalletStatus` type, still including `"CLOSED"` at the type level even though no runtime value does). */
export const SETTABLE_WALLET_STATUSES = WALLET_STATUSES.filter(
  (s): s is Exclude<WalletStatus, "CLOSED"> => s !== "CLOSED",
);
export type SettableWalletStatus = (typeof SETTABLE_WALLET_STATUSES)[number];

export const WALLET_TRANSACTION_TYPES = ["TOPUP", "SPEND", "TRANSFER_IN", "TRANSFER_OUT", "FEE_TRANSFER", "REFUND", "ADJUSTMENT"] as const;
export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number];

export const WALLET_SERVICE_POINT_TYPES = [
  "TRANSPORT",
  "LIBRARY",
  "SHOP",
  "MEALS",
  "PRINTING",
  "TRIPS",
  "ACTIVITIES",
  "EMERGENCY",
  "CUSTOM",
] as const;
export type WalletServicePointType = (typeof WALLET_SERVICE_POINT_TYPES)[number];

/** `TopUpDto.method` — mirrors `wallet-transaction.dto.ts`'s `PAY_METHODS` array exactly. */
export const WALLET_TOPUP_METHODS = [
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

/** `RefundWalletDto.payoutMethod`/`CloseWalletRefundDto.payoutMethod` — mirrors `wallet-transaction.dto.ts`'s `REFUND_METHODS` array exactly. */
export const WALLET_REFUND_METHODS = ["CASH", "BANK", "MPESA_B2C"] as const;

export const WALLET_CLOSE_DISPOSITIONS = ["REFUND", "TRANSFER_TO_SIBLING", "APPLY_TO_FEES"] as const;
export type WalletCloseDisposition = (typeof WALLET_CLOSE_DISPOSITIONS)[number];

/**
 * Phase 6 Slice 11 (Part 3) — `appr_instance.domain_code`/`entity_type`
 * values `wallet-transactions.service.ts` submits under (its own
 * `WALLET_TRANSFER_APPROVAL_DOMAIN_CODE`/`WALLET_TRANSFER_ENTITY_TYPE`
 * constants etc., restated here rather than imported since the frontend has
 * no import path into `packages/server`, same convention this file's own
 * doc comment already established for the transaction-type/service-point-
 * type/method arrays above). `entity_id` is always the WALLET id for all
 * three. Transfer-to-fees and transfer-to-wallet deliberately share ONE
 * domain code/entity type (`WALLET_TRANSFER`/`wall_wallet_transfer`) — a
 * real backend design choice (confirmed by reading that service's own doc
 * comment: distinct entity types exist ONLY to keep transfer/refund/
 * adjustment from colliding with EACH OTHER on the same wallet, not to
 * distinguish the two transfer sub-kinds from one another) — so at most one
 * PENDING transfer request (either sub-kind) can exist per wallet at a time
 * (enforced by `uq_appr_instance_open_p`, scoped to `(entity_type,
 * entity_id)`), while a transfer, a refund, AND an adjustment CAN all be
 * pending simultaneously for the same wallet.
 */
export const WALLET_TRANSFER_APPROVAL_DOMAIN_CODE = "WALLET_TRANSFER";
export const WALLET_REFUND_APPROVAL_DOMAIN_CODE = "WALLET_REFUND";
export const WALLET_ADJUSTMENT_APPROVAL_DOMAIN_CODE = "WALLET_ADJUSTMENT";

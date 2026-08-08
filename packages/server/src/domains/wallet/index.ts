/**
 * Public barrel — the only surface any future sibling module should import
 * from (`crossSiblingImportPolicy` in module-deps.json). Module 11 (Wallet).
 */
export { WalletModule } from "./wallet.module";

export { WalletsService, WALLET_MAX_DAILY_LIMIT_SETTING_KEY, WALLET_MAX_TXN_LIMIT_SETTING_KEY } from "./application/wallets.service";
export type { UpdateWalletLimitsInput } from "./application/wallets.service";
export { ServicePointsService } from "./application/service-points.service";
export type { CreateServicePointInput, UpdateServicePointInput } from "./application/service-points.service";
export {
  WalletTransactionsService,
  WALLET_TRANSFER_APPROVAL_DOMAIN_CODE,
  WALLET_REFUND_APPROVAL_DOMAIN_CODE,
  WALLET_ADJUSTMENT_APPROVAL_DOMAIN_CODE,
  WALLET_TRANSFER_ENTITY_TYPE,
  WALLET_REFUND_ENTITY_TYPE,
  WALLET_ADJUSTMENT_ENTITY_TYPE,
  WALLET_TRANSFER_APPROVAL_THRESHOLD_SETTING_KEY,
} from "./application/wallet-transactions.service";
export type {
  TopUpInput,
  SpendInput,
  TransferToFeesInput,
  SweepToInvoicesInput,
  SweepToInvoicesAllocationResult,
  SweepToInvoicesShortfallResult,
  SweepToInvoicesResult,
  TransferToWalletInput,
  TransferToWalletResult,
  RefundInput,
  RefundPayoutTarget,
  AdjustInput,
  CloseWalletInput,
  CloseWalletDisposition,
} from "./application/wallet-transactions.service";
export { resolveWalletControlAccount, resolveTopUpClearingAccount, resolveRefundPayoutAccount } from "./application/wallet-control-accounts.util";
export type { WallRefundPayoutMethod } from "./application/wallet-control-accounts.util";

export { WalletStatusChangedEvent } from "./events/wallet-status-changed.event";
export type { WalletStatusChangedPayload } from "./events/wallet-status-changed.event";
export { WalletTransactionPostedEvent } from "./events/wallet-transaction-posted.event";
export type { WalletTransactionPostedPayload } from "./events/wallet-transaction-posted.event";

export { WallWalletEntity, WALL_WALLET_STATUSES } from "./domain/wall-wallet.entity";
export type { WallWalletStatus } from "./domain/wall-wallet.entity";
export { WallTransactionEntity, WALL_TRANSACTION_TYPES } from "./domain/wall-transaction.entity";
export type { WallTransactionType, WallTransactionDirection } from "./domain/wall-transaction.entity";
export { WallServicePointEntity, WALL_SERVICE_POINT_TYPES } from "./domain/wall-service-point.entity";
export type { WallServicePointType } from "./domain/wall-service-point.entity";
export { WallServicePointOperatorEntity } from "./domain/wall-service-point-operator.entity";

export { WallWalletRepository } from "./infrastructure/wall-wallet.repository";
export { WallTransactionRepository } from "./infrastructure/wall-transaction.repository";
export { WallServicePointRepository } from "./infrastructure/wall-service-point.repository";
export { WallServicePointOperatorRepository } from "./infrastructure/wall-service-point-operator.repository";

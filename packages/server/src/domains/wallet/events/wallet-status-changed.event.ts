import { BaseDomainEvent } from "../../../shared/events/domain-event";

export interface WalletStatusChangedPayload extends Record<string, unknown> {
  walletId: string;
  studentId: string;
  fromStatus: string;
  toStatus: string;
  reason: string | null;
  actorId: string;
}

/**
 * Published (via the shared outbox writer) whenever `WalletsService.setStatus()`
 * or `WalletTransactionsService.closeWallet()` flips a wallet's `status`. No
 * subscriber exists yet (e.g. a future guardian-notification handler) — same
 * "event exists, dispatcher doesn't" pattern as every other module's outbox
 * events so far (see `StudentStatusChangedEvent`'s doc comment for the exact
 * precedent this mirrors).
 */
export class WalletStatusChangedEvent extends BaseDomainEvent<WalletStatusChangedPayload> {
  readonly eventType = "wallet.wallet_status_changed";
  readonly aggregateType = "wall_wallet";

  constructor(walletId: string, payload: WalletStatusChangedPayload) {
    super(walletId, payload);
  }
}

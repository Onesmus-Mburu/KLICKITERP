import { BaseDomainEvent } from "../../../shared/events/domain-event";

export interface WalletTransactionPostedPayload extends Record<string, unknown> {
  walletId: string;
  transactionId: string;
  type: string;
  direction: string;
  amount: string;
  balanceAfter: string;
  journalId: string;
  actorId: string;
}

/**
 * Published (via the shared outbox writer) whenever a `wall_transaction` row
 * is inserted (every `WalletTransactionsService` method). No subscriber
 * exists yet (e.g. a future guardian low-balance/spend-notification
 * handler, `platform/comms`) — same "event exists, dispatcher doesn't"
 * pattern as every other module's outbox events so far.
 */
export class WalletTransactionPostedEvent extends BaseDomainEvent<WalletTransactionPostedPayload> {
  readonly eventType = "wallet.wallet_transaction_posted";
  readonly aggregateType = "wall_transaction";

  constructor(transactionId: string, payload: WalletTransactionPostedPayload) {
    super(transactionId, payload);
  }
}

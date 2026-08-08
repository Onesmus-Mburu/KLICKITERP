import { BaseDomainEvent } from "../../../shared/events/domain-event";

export interface PromotionBatchExecutedPayload extends Record<string, unknown> {
  batchId: string;
  fromYearId: string;
  toYearId: string;
  promotedCount: number;
  failedCount: number;
  actorId: string | null;
}

/**
 * Published (via the shared outbox writer) whenever `PromotionService.promoteBatch()`
 * completes and records a `std_promotion_batch` row (FR-BILL-005). No
 * subscriber exists yet — same "event exists, dispatcher doesn't" pattern as
 * every other module's outbox events so far.
 */
export class PromotionBatchExecutedEvent extends BaseDomainEvent<PromotionBatchExecutedPayload> {
  readonly eventType = "students.promotion_batch_executed";
  readonly aggregateType = "std_promotion_batch";

  constructor(batchId: string, payload: PromotionBatchExecutedPayload) {
    super(batchId, payload);
  }
}

import { BaseDomainEvent } from "../../shared/events/domain-event";

export interface PeriodClosedPayload extends Record<string, unknown> {
  periodId: string;
  fiscalYearId: string;
  actorId: string | null;
}

/**
 * Published (via the shared outbox writer, inside the same transaction as
 * the `gl_period` status flip) when `FiscalYearsService.hardClosePeriod()`
 * transitions a period `SOFT_CLOSED -> HARD_CLOSED`. Not published on
 * `openPeriod()`/`softClosePeriod()` — hard close is the irreversible,
 * report-worthy event other modules (reporting engine, integrity sweep
 * scheduling) would care about. No subscriber exists yet (same "event
 * exists, dispatcher doesn't" pattern as every other module's outbox
 * events so far).
 */
export class PeriodClosedEvent extends BaseDomainEvent<PeriodClosedPayload> {
  readonly eventType = "accounting.period_closed";
  readonly aggregateType = "gl_period";

  constructor(periodId: string, payload: PeriodClosedPayload) {
    super(periodId, payload);
  }
}

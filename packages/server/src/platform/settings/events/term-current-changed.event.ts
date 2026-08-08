import { BaseDomainEvent } from "../../../shared/events/domain-event";

export interface TermCurrentChangedPayload extends Record<string, unknown> {
  fromTermId: string | null;
  toTermId: string;
  actorId: string | null;
}

/**
 * Published whenever `AcademicCalendarService.setCurrentTerm` flips
 * `is_current` to a new `set_term` row. `NumberingService.allocate()`'s
 * TERMLY reset policy reads the current term synchronously (inside the
 * caller's own transaction) rather than subscribing to this event — this
 * event exists for out-of-band consumers (billing period rollovers,
 * dashboards) that don't need allocator-strength consistency.
 */
export class TermCurrentChangedEvent extends BaseDomainEvent<TermCurrentChangedPayload> {
  readonly eventType = "settings.term.current_changed";
  readonly aggregateType = "set_term";

  constructor(termId: string, payload: TermCurrentChangedPayload) {
    super(termId, payload);
  }
}

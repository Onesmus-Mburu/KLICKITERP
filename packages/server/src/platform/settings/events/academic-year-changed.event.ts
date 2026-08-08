import { BaseDomainEvent } from "../../../shared/events/domain-event";

export interface AcademicYearChangedPayload extends Record<string, unknown> {
  fromYearId: string | null;
  toYearId: string;
  actorId: string | null;
}

/**
 * Published (via the transactional outbox) whenever
 * `AcademicCalendarService.setCurrentYear` flips `is_current` to a new
 * `set_academic_year` row. No in-process handler subscribes yet — billing
 * period rollovers, dashboards, and the reporting engine (later modules)
 * are the eventual consumers.
 */
export class AcademicYearChangedEvent extends BaseDomainEvent<AcademicYearChangedPayload> {
  readonly eventType = "settings.academic_year.current_changed";
  readonly aggregateType = "set_academic_year";

  constructor(yearId: string, payload: AcademicYearChangedPayload) {
    super(yearId, payload);
  }
}

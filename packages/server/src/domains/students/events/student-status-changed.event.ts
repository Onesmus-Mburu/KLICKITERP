import { BaseDomainEvent } from "../../../shared/events/domain-event";

export interface StudentStatusChangedPayload extends Record<string, unknown> {
  studentId: string;
  fromStatus: string;
  toStatus: string;
  exitCleared: boolean;
  actorId: string | null;
}

/**
 * Published (via the shared outbox writer) whenever `StudentsService.changeStatus()`
 * flips a student's `status`. No subscriber exists yet (e.g. a future
 * Wallet/Module 11 auto-freeze-on-WITHDRAWN handler per FR-WALL-009.1) — same
 * "event exists, dispatcher doesn't" pattern as every other module's outbox
 * events so far.
 */
export class StudentStatusChangedEvent extends BaseDomainEvent<StudentStatusChangedPayload> {
  readonly eventType = "students.student_status_changed";
  readonly aggregateType = "std_student";

  constructor(studentId: string, payload: StudentStatusChangedPayload) {
    super(studentId, payload);
  }
}

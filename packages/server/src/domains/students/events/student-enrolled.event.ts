import { BaseDomainEvent } from "../../../shared/events/domain-event";

export interface StudentEnrolledPayload extends Record<string, unknown> {
  studentId: string;
  admissionNo: string;
  classId: string;
  streamId: string | null;
  enrolledOn: string;
  actorId: string | null;
}

/**
 * Published (via the shared outbox writer) whenever `StudentsService.create()`
 * inserts a new `std_student` row. No subscriber exists yet — same "event
 * exists, dispatcher doesn't" pattern as every other module's outbox events
 * in this codebase so far.
 */
export class StudentEnrolledEvent extends BaseDomainEvent<StudentEnrolledPayload> {
  readonly eventType = "students.student_enrolled";
  readonly aggregateType = "std_student";

  constructor(studentId: string, payload: StudentEnrolledPayload) {
    super(studentId, payload);
  }
}

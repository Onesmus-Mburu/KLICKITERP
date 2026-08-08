/**
 * Public barrel — the only surface any future sibling module should import
 * from (`crossSiblingImportPolicy` in module-deps.json). `StudentLedgerService`
 * and `StudentsService` are the headline exports — Billing (Module 9),
 * Payments (Module 10), and Wallet (Module 11) are all expected to inject
 * them directly, mirroring how `accounting`'s `PostingService` and
 * `platform/settings`' `NumberingService` are consumed by their callers.
 */
export { StudentsModule } from "./students.module";

export { ClassesService } from "./application/classes.service";
export type { CreateStdClassInput, UpdateStdClassInput } from "./application/classes.service";
export { StreamsService } from "./application/streams.service";
export type { CreateStdStreamInput, UpdateStdStreamInput } from "./application/streams.service";
export { FeeGroupsService } from "./application/fee-groups.service";
export type { CreateStdFeeGroupInput, UpdateStdFeeGroupInput } from "./application/fee-groups.service";
export { StudentsService } from "./application/students.service";
export type { CreateStdStudentInput, UpdateStdStudentInput } from "./application/students.service";
export { GuardiansService } from "./application/guardians.service";
export type { CreateStdGuardianInput, UpdateStdGuardianInput } from "./application/guardians.service";
export { StudentLedgerService } from "./application/student-ledger.service";
export type { AppendLedgerEntryInput } from "./application/student-ledger.service";
export { PromotionService } from "./application/promotion.service";
export type { PromoteBatchInput, PromoteStudentInput, PromotionBatchSummary } from "./application/promotion.service";

export { StudentEnrolledEvent } from "./events/student-enrolled.event";
export type { StudentEnrolledPayload } from "./events/student-enrolled.event";
export { StudentStatusChangedEvent } from "./events/student-status-changed.event";
export type { StudentStatusChangedPayload } from "./events/student-status-changed.event";
export { PromotionBatchExecutedEvent } from "./events/promotion-batch-executed.event";
export type { PromotionBatchExecutedPayload } from "./events/promotion-batch-executed.event";

export { StdClassEntity } from "./domain/std-class.entity";
export { StdStreamEntity } from "./domain/std-stream.entity";
export { StdFeeGroupEntity } from "./domain/std-fee-group.entity";
export {
  StdStudentEntity,
  STD_STUDENT_STATUSES,
  STD_STUDENT_EXIT_STATUSES,
  STD_STUDENT_BOARDING_KINDS,
} from "./domain/std-student.entity";
export type { StdStudentStatus, StdStudentBoarding } from "./domain/std-student.entity";
export { StdGuardianEntity } from "./domain/std-guardian.entity";
export { StdStudentGuardianEntity } from "./domain/std-student-guardian.entity";
export { StdLedgerEntryEntity } from "./domain/std-ledger-entry.entity";
export { StdPromotionBatchEntity } from "./domain/std-promotion-batch.entity";

export { StdClassRepository } from "./infrastructure/std-class.repository";
export { StdStreamRepository } from "./infrastructure/std-stream.repository";
export { StdFeeGroupRepository } from "./infrastructure/std-fee-group.repository";
export { StdStudentRepository } from "./infrastructure/std-student.repository";
export type { ListStdStudentsFilter } from "./infrastructure/std-student.repository";
export { StdGuardianRepository } from "./infrastructure/std-guardian.repository";
export { StdStudentGuardianRepository } from "./infrastructure/std-student-guardian.repository";
export { StdLedgerEntryRepository } from "./infrastructure/std-ledger-entry.repository";
export type { StdLedgerStatementRow } from "./infrastructure/std-ledger-entry.repository";
export { StdPromotionBatchRepository } from "./infrastructure/std-promotion-batch.repository";

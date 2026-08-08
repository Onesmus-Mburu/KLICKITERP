/**
 * Mirrors `packages/server/src/domains/students/domain/std-student.entity.ts`'s
 * own exported constants (`STD_STUDENT_STATUSES`, `STD_STUDENT_EXIT_STATUSES`,
 * `STD_STUDENT_BOARDING_KINDS`) — that file isn't exported through
 * `@klickit/contracts` (only the zod schemas/DTO types are, per this
 * codebase's DTO/entity boundary), so these are hand-mirrored here, the same
 * narrow "hand-retype a shape" exception `types/dashboard.ts` already
 * documents for `DashboardController`'s missing `@ApiResponse({type})`
 * decorators. `ChangeStudentStatusDtoSchema`'s real zod enum
 * (`z.enum(["ACTIVE","ALUMNI","TRANSFERRED","SUSPENDED","WITHDRAWN"])`,
 * confirmed by reading `change-student-status.schema.ts`) is the source of
 * truth cross-checked against.
 */
export const STUDENT_STATUSES = ["ACTIVE", "ALUMNI", "TRANSFERRED", "SUSPENDED", "WITHDRAWN"] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

/** Statuses `StudentsService.changeStatus()` gates on `exitCleared=true` (mirrors `trg_std_student_exit_guard`, migration `0065`) — a transition INTO one of these FROM a non-exit status is rejected server-side unless the student is already exit-cleared. */
export const STUDENT_EXIT_STATUSES: readonly StudentStatus[] = ["ALUMNI", "TRANSFERRED", "WITHDRAWN"];

export const STUDENT_BOARDING_KINDS = ["DAY", "BOARDER"] as const;
export type StudentBoarding = (typeof STUDENT_BOARDING_KINDS)[number];

import type {
  CreatePyrlLoanDto,
  DecidePyrlLoanDto,
  PyrlLoanResponseDto,
  PyrlLoanScheduleResponseDto,
  RecordLoanRecoveryDto,
  SettleLoanEarlyDto,
} from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * `@klickit/contracts` exports no standalone `PyrlLoanRateKind`/
 * `PyrlLoanStatus` type (unlike `PyrlComponentKind`/`PyrlEmploymentType`,
 * which Part 1 found are plain TS unions defined and exported directly from
 * `packages/server`'s own domain entities but never re-exported through
 * contracts either) — both enums only exist inline, embedded inside
 * `CreatePyrlLoanDto.rateKind`/`PyrlLoanResponseDto.status`'s own zod-inferred
 * shape. Derived here via indexed access on the real response DTO type
 * (rather than hand-typing a second copy of the literal union that could
 * drift) and re-exported for every component in this part to share, the same
 * "define once, reuse" precedent `lib/statutory-params.ts`'s own
 * `PyrlStatutoryKind` established for Part 4 (a type with no contracts-level
 * export of its own).
 */
export type PyrlLoanRateKind = PyrlLoanResponseDto["rateKind"];
export type PyrlLoanStatus = PyrlLoanResponseDto["status"];

/**
 * Phase 6 Slice 22 Part 5 (Payroll, Module 15) — thin wrapper over
 * `LoansController`
 * (`packages/server/src/domains/payroll/api/loans.controller.ts`, base
 * `/api/v1/payroll/loans`, tag `payroll-loans`). **No dedicated `:view`
 * permission — every read route reuses `payroll:loan:create`** (confirmed by
 * reading the controller's own doc comment directly: "reuse the nearest one,"
 * the same precedent `PurchaseOrdersController` established). Write actions
 * beyond create (`decide`/`record-recovery`/`settle-early`) require the
 * separate, more-privileged `payroll:loan:decide`.
 *
 * **Zero request-body codegen gaps here — checked directly, not assumed,
 * a real DIFFERENT finding from Part 1's own `kind`/`employmentType` and
 * Part 4's own `kind` findings**: `CreatePyrlLoanDtoSchema.rateKind` (the
 * zod-inferred type) IS a real `z.enum(["FLAT", "REDUCING"])`, matching the
 * RAW generated type's `rateKind: "FLAT" | "REDUCING"` exactly — because
 * `loan.dto.ts`'s `CreatePyrlLoanDto.rateKind` is validated server-side via
 * `@IsIn(PYRL_LOAN_RATE_KINDS)` (which the zod-codegen script mirrors as a
 * real literal union), not `@IsString()` (the class of gap Parts 1/4 found on
 * `kind`/`employmentType`/statutory `kind` — all validated via `@IsString()`
 * instead). Every write function below passes its `dto` straight through
 * with no `as unknown as` cast, confirmed by a clean `tsc --noEmit`.
 *
 * **One response-side gap exists on `PyrlLoanResponseDto`, absorbed for
 * free, the same nullable-without-an-explicit-`type:`-hint reflection class
 * Parts 2/3/4 already documented for `grade`/`effectiveTo`**: the RAW
 * generated `openapi-types.ts` types `approvalRef` as
 * `Record<string, never> | null` (`approvalRef!: string | null` on the
 * response DTO class has no explicit `type:` hint for `@nestjs/swagger`'s
 * reflection to pick up), while the zod-inferred `PyrlLoanResponseDtoSchema`
 * gets it right (`approvalRef: z.string().nullable()`). Every read function
 * below uses the zod-inferred type directly as its return type (matching
 * `employees.api.ts`'s own established precedent), and `unwrapApiResult<T>`'s
 * `data: unknown` parameter absorbs the raw-type mismatch for free — no local
 * interface-plus-cast needed anywhere in this file.
 *
 * **`GET /payroll/loans` requires `employeeId` — no global cross-employee
 * list exists** (confirmed by reading `listByEmployee(@Query("employeeId")
 * employeeId: string)` directly, no default/optional), the same "every route
 * scoped by employeeId" shape Part 3's own
 * `EmployeeAssignmentsController`/`EmployeeComponentsController` established.
 *
 * **`GET .../schedule` returns a genuinely empty `[]` before a loan reaches
 * `ACTIVE`** — no schedule rows exist until `decide(approved: true)`
 * succeeds (`onApprovalDecided()` is the ONLY place `pyrl_loan_schedule` rows
 * are ever created, `loans.service.ts:236-258`). A loan that was rejected
 * (`decide(approved: false)`, landing at `WRITTEN_OFF`) never goes through
 * that path either, so its schedule stays `[]` forever too — both are
 * genuinely expected empty results, not errors; see `loan-schedule-table.tsx`'s
 * own doc comment for how the UI distinguishes this from a real empty-state.
 */
export async function listLoansByEmployee(employeeId: string): Promise<PyrlLoanResponseDto[]> {
  return unwrapApiResult<PyrlLoanResponseDto[]>(await apiClient.GET("/api/v1/payroll/loans", { params: { query: { employeeId } } }));
}

export async function getLoan(id: string): Promise<PyrlLoanResponseDto> {
  return unwrapApiResult<PyrlLoanResponseDto>(await apiClient.GET("/api/v1/payroll/loans/{id}", { params: { path: { id } } }));
}

export async function getLoanSchedule(id: string): Promise<PyrlLoanScheduleResponseDto[]> {
  return unwrapApiResult<PyrlLoanScheduleResponseDto[]>(await apiClient.GET("/api/v1/payroll/loans/{id}/schedule", { params: { path: { id } } }));
}

/**
 * `principal` must be positive and `termMonths` a positive integer — both
 * enforced server-side with real, exact `ValidationException` messages
 * (`loans.service.ts:186-191`: `"pyrl_loan principal must be positive"` /
 * `"pyrl_loan term_months must be a positive integer"`), surfaced verbatim
 * via `ApiError.message` on a caught 4xx, not paraphrased. Creates the loan
 * at `PENDING_APPROVAL` with `balance = principal` and genuinely submits a
 * real `appr_instance` (domain `PAYROLL_LOANS`) — the response's
 * `approvalRef` is that instance's real id, not a placeholder.
 */
export async function createLoan(dto: CreatePyrlLoanDto): Promise<PyrlLoanResponseDto> {
  return unwrapApiResult<PyrlLoanResponseDto>(await apiClient.POST("/api/v1/payroll/loans", { body: dto }));
}

/**
 * Only valid from `PENDING_APPROVAL` — otherwise a real `ValidationException`
 * (`` `Cannot record an approval decision on a pyrl_loan not in
 * PENDING_APPROVAL (status=${status})` ``), surfaced verbatim.
 * `approved: false` does **not** produce a "REJECTED" status — `pyrl_loan`'s
 * real status enum has no such value; it goes straight to `WRITTEN_OFF`, the
 * nearest terminal state for an application that never went live (see
 * `loan-decide-dialog.tsx`'s own doc comment for the UI-copy implication).
 * `approved: true` flips to `ACTIVE`, resets `balance = principal`, and —
 * only at this moment, never before — generates the entire amortization
 * schedule in one shot.
 */
export async function decideLoan(id: string, dto: DecidePyrlLoanDto): Promise<PyrlLoanResponseDto> {
  return unwrapApiResult<PyrlLoanResponseDto>(await apiClient.POST("/api/v1/payroll/loans/{id}/decide", { params: { path: { id } }, body: dto }));
}

/**
 * An out-of-band manual correction tool, not the normal path — real payroll
 * runs call `LoansService.recordRecovery()` directly at commit time (a
 * future part's own concern). Only valid on an `ACTIVE` loan, and requires an
 * existing schedule row with `duePeriod === periodKey` EXACTLY — both
 * violations surface real `ValidationException` messages verbatim (see
 * `record-recovery-dialog.tsx`'s own doc comment for why its period field is
 * a picker sourced from the loan's own real schedule, never free-typed).
 */
export async function recordLoanRecovery(id: string, dto: RecordLoanRecoveryDto): Promise<PyrlLoanResponseDto> {
  return unwrapApiResult<PyrlLoanResponseDto>(
    await apiClient.POST("/api/v1/payroll/loans/{id}/record-recovery", { params: { path: { id } }, body: dto }),
  );
}

/**
 * Only valid on `ACTIVE`. A lump-sum payoff, not a partial payment — cancels
 * every schedule installment due AFTER the settlement month that has not yet
 * had any recovery recorded (zeroes `principalDue`/`interestDue` on those
 * rows), and sets `balance = 0`/`status = SETTLED` unconditionally.
 */
export async function settleLoanEarly(id: string, dto: SettleLoanEarlyDto): Promise<PyrlLoanResponseDto> {
  return unwrapApiResult<PyrlLoanResponseDto>(
    await apiClient.POST("/api/v1/payroll/loans/{id}/settle-early", { params: { path: { id } }, body: dto }),
  );
}

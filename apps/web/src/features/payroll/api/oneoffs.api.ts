import type { CreatePyrlOneoffDto, PyrlOneoffResponseDto, UpdatePyrlOneoffDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

export type PyrlOneoffKind = PyrlOneoffResponseDto["kind"];

/**
 * Phase 6 Slice 22 Part 6 (Payroll, Module 15) — thin wrapper over
 * `OneoffsController`
 * (`packages/server/src/domains/payroll/api/oneoffs.controller.ts`, base
 * `/api/v1/payroll/oneoffs`, tag `payroll-oneoffs`). **A single permission,
 * `payroll:oneoff:manage`, gates all 5 routes, including every read** —
 * confirmed by reading the controller directly, the same "one bundled
 * permission, no separate view code" shape `ComponentsController`/
 * `StatutoryTablesController` already established.
 *
 * **`GET /payroll/oneoffs`'s real behavior depends on which of `employeeId`/
 * `periodKey` are supplied** (confirmed by reading `list()` directly,
 * `oneoffs.controller.ts:80-91`): both -> that employee's one-offs for that
 * period; `periodKey` alone -> EVERY one-off queued for that period across
 * every employee (what `run-oneoffs-panel.tsx` uses); neither -> a genuine
 * `[]`, not an error. `listOneoffsByPeriod()` below is the one this part's
 * UI actually calls; `listOneoffsByEmployeeAndPeriod()` is included for
 * completeness/future reuse but has no call site in this part.
 *
 * **Zero request-body codegen gaps** — checked directly against
 * `oneoff.schema.ts`: `CreatePyrlOneoffDtoSchema.kind` IS a real
 * `z.enum(["EARNING", "DEDUCTION"])` (validated server-side via
 * `@IsIn(PYRL_ONEOFF_KINDS)`, not `@IsString()`), matching the raw generated
 * type exactly — the same "validated via `@IsIn`, not `@IsString()`" shape
 * Part 5's own `CreatePyrlLoanDto.rateKind` finding established, genuinely
 * different from Part 1's/Part 4's own `kind`/`employmentType` gaps. No cast
 * needed on any write function below.
 *
 * **DB-unique on `(employeeId, periodKey, componentId)`** — see
 * `create-oneoff-dialog.tsx`'s own doc comment for whether a clean 409
 * exists for this (checked live, not assumed, this part's own opportunistic
 * backend-fix candidate per the task brief).
 */
interface OneoffsListQueryShape {
  employeeId?: string;
  periodKey?: string;
}

export async function listOneoffsByPeriod(periodKey: string): Promise<PyrlOneoffResponseDto[]> {
  const query: OneoffsListQueryShape = { periodKey };
  return unwrapApiResult<PyrlOneoffResponseDto[]>(
    await apiClient.GET("/api/v1/payroll/oneoffs", { params: { query: query as unknown as Required<OneoffsListQueryShape> } }),
  );
}

export async function listOneoffsByEmployeeAndPeriod(employeeId: string, periodKey: string): Promise<PyrlOneoffResponseDto[]> {
  const query: OneoffsListQueryShape = { employeeId, periodKey };
  return unwrapApiResult<PyrlOneoffResponseDto[]>(
    await apiClient.GET("/api/v1/payroll/oneoffs", { params: { query: query as unknown as Required<OneoffsListQueryShape> } }),
  );
}

export async function getOneoff(id: string): Promise<PyrlOneoffResponseDto> {
  return unwrapApiResult<PyrlOneoffResponseDto>(await apiClient.GET("/api/v1/payroll/oneoffs/{id}", { params: { path: { id } } }));
}

/**
 * No status/lifecycle field at all — a one-off is either present (consumed
 * by whichever run next computes for its `periodKey`) or absent (deleted).
 * `reason` is required (no minimum length enforced server-side, confirmed by
 * reading `oneoff.dto.ts` directly — just `@IsString()`), but
 * `create-oneoff-dialog.tsx` still requires a real, non-whitespace value
 * client-side rather than merely satisfying the type.
 */
export async function createOneoff(dto: CreatePyrlOneoffDto): Promise<PyrlOneoffResponseDto> {
  return unwrapApiResult<PyrlOneoffResponseDto>(await apiClient.POST("/api/v1/payroll/oneoffs", { body: dto }));
}

/** Only `amount`/`reason` are editable — `employeeId`/`periodKey`/`kind`/`componentId` are create-only/immutable (confirmed by reading `UpdatePyrlOneoffDto` directly, and simply omitted from this DTO's own shape). */
export async function updateOneoff(id: string, dto: UpdatePyrlOneoffDto): Promise<PyrlOneoffResponseDto> {
  return unwrapApiResult<PyrlOneoffResponseDto>(
    await apiClient.PATCH("/api/v1/payroll/oneoffs/{id}", { params: { path: { id } }, body: dto }),
  );
}

/**
 * A one-off becomes effectively frozen in practice once a run has consumed
 * it — nothing stops editing/deleting it after, but doing so has no
 * retroactive effect on an already-computed run's lines, only a RECOMPUTE
 * picks up the change (see `run-oneoffs-panel.tsx`'s own doc comment for the
 * exact UI copy this drives).
 */
export async function deleteOneoff(id: string): Promise<{ removed: boolean }> {
  return unwrapApiResult<{ removed: boolean }>(await apiClient.DELETE("/api/v1/payroll/oneoffs/{id}", { params: { path: { id } } }));
}

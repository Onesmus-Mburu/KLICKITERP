import type {
  CreatePyrlRunDto,
  DecidePyrlRunDto,
  PayPyrlRunDto,
  PyrlRunLineComponentResponseDto,
  PyrlRunLineResponseDto,
  PyrlRunResponseDto,
} from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * `@klickit/contracts`' zod-inferred `PyrlRunResponseDto` already carries
 * clean literal unions for both `runKind`/`status` — checked directly
 * against `payroll-run.schema.ts`, not assumed: `runKind` is validated
 * server-side via `@IsIn(PYRL_RUN_KINDS)` (not `@IsString()`), so unlike
 * Part 1's/Part 4's own `kind`/`employmentType` findings, there is no
 * codegen gap to work around here. Derived via indexed access anyway (rather
 * than hand-typing a second copy) so every component in this part shares one
 * definition, the same "define once, reuse" precedent `loans.api.ts`'s own
 * `PyrlLoanRateKind`/`PyrlLoanStatus` established for Part 5.
 */
export type PyrlRunKind = PyrlRunResponseDto["runKind"];
export type PyrlRunStatus = PyrlRunResponseDto["status"];

/**
 * Phase 6 Slice 22 Part 7 — `PayPyrlRunDto.method` derived via indexed access
 * on `PyrlRunLineResponseDto["paidVia"]` (minus `null`), the same
 * define-once-reuse precedent this file's own `PyrlRunKind`/`PyrlRunStatus`
 * above already establish. **No codegen gap on `PayPyrlRunDto`/
 * `DecidePyrlRunDto` at all — checked directly, not assumed**: both
 * `method`/`approved` are validated server-side via `@IsIn(...)`/
 * `@IsBoolean()` (`payroll-run.dto.ts`), so the zod-inferred types
 * (`payroll-run.schema.ts`) and the raw generated `openapi-types.ts` agree
 * exactly — `method: "BANK" | "MPESA_B2C" | "CASH"` on both, no
 * `Record<string, never>` gap, no lost-union `z.string()` gap. Every write
 * function below passes its dto straight through with no boundary cast.
 */
export type PyrlRunLinePaidVia = NonNullable<PyrlRunLineResponseDto["paidVia"]>;

/**
 * Phase 6 Slice 22 Part 6 (Payroll, Module 15) — thin wrapper over
 * `PayrollRunsController`
 * (`packages/server/src/domains/payroll/api/payroll-runs.controller.ts`,
 * base `/api/v1/payroll/runs`, tag `payroll-runs`). Part 6's own scope
 * covered `create -> compute -> review -> submit -> decide`; **Part 7
 * completes the lifecycle** with `commit -> pay -> file` below (own doc
 * comments on each function), finishing this wrapper's coverage of the
 * entire real controller.
 *
 * **`GET /payroll/runs`'s raw generated query shape marks BOTH `periodKey`/
 * `status` as required strings** (`openapi-types.ts` line ~25221) even
 * though `PayrollRunsController.list()` itself takes two genuinely optional
 * `@Query()` params (confirmed by reading the controller directly) — the
 * same "Swagger's `@ApiQuery`-less plain-`@Query()` param reflection always
 * emits a required string" gap this codebase's other list endpoints already
 * work around (see `components.api.ts`/`employees.api.ts`'s own
 * `...ListQueryShape` + `as unknown as Required<...>` cast precedent).
 * `listRuns()` below follows the identical pattern.
 *
 * **`totals`/`varianceReport` are both `Record<string, unknown>` here,
 * deliberately** — `PyrlRunResponseDto.totals`/`.varianceReport` carry no
 * fixed OpenAPI shape server-side (`@ApiProperty({ type: "object",
 * additionalProperties: true })`, confirmed by reading `payroll-run.dto.ts`
 * directly), so there is nothing for codegen to get right or wrong. Callers
 * cast these through `lib/run-totals.ts`'s own `asRunTotals()`/
 * `asVarianceReport()` safe-cast helpers rather than trusting an assumed
 * shape blindly.
 */
interface RunsListQueryShape {
  periodKey?: string;
  status?: string;
}

export interface ListPyrlRunsParams {
  periodKey?: string;
  status?: PyrlRunStatus;
}

export async function listRuns(params: ListPyrlRunsParams = {}): Promise<PyrlRunResponseDto[]> {
  const query: RunsListQueryShape = {};
  if (params.periodKey !== undefined && params.periodKey !== "") query.periodKey = params.periodKey;
  if (params.status !== undefined) query.status = params.status;
  return unwrapApiResult<PyrlRunResponseDto[]>(
    await apiClient.GET("/api/v1/payroll/runs", { params: { query: query as unknown as Required<RunsListQueryShape> } }),
  );
}

export async function getRun(id: string): Promise<PyrlRunResponseDto> {
  return unwrapApiResult<PyrlRunResponseDto>(await apiClient.GET("/api/v1/payroll/runs/{id}", { params: { path: { id } } }));
}

export async function listRunLines(id: string): Promise<PyrlRunLineResponseDto[]> {
  return unwrapApiResult<PyrlRunLineResponseDto[]>(await apiClient.GET("/api/v1/payroll/runs/{id}/lines", { params: { path: { id } } }));
}

/**
 * `GET /payroll/runs/lines/:lineId/components` — NOT nested under a run id
 * (confirmed by reading `payroll-runs.controller.ts:208` directly, the same
 * "the route path doesn't match the concept's natural nesting" fact the
 * task brief itself calls out). Wired by Part 6 for Part 7 to reuse
 * directly — **now consumed by `payslip-view.tsx`** for the full
 * earning/deduction breakdown, cross-referenced against `useComponents()`
 * for real `code — name` labels rather than raw component uuids.
 */
export async function listRunLineComponents(lineId: string): Promise<PyrlRunLineComponentResponseDto[]> {
  return unwrapApiResult<PyrlRunLineComponentResponseDto[]>(
    await apiClient.GET("/api/v1/payroll/runs/lines/{lineId}/components", { params: { path: { lineId } } }),
  );
}

/**
 * A run is genuinely system-wide per period — no department/employee-subset
 * scope field exists on `CreatePyrlRunDto` at all (confirmed by reading it
 * directly). `runKind: "SUPPLEMENTARY"` requires `supplementsRunId`
 * — service-validated, not DTO-validated (`ValidationException`, real
 * message surfaced verbatim via `ApiError.message` on a caught 4xx, see
 * `create-payroll-run-dialog.tsx`'s own doc comment).
 */
export async function createRun(dto: CreatePyrlRunDto): Promise<PyrlRunResponseDto> {
  return unwrapApiResult<PyrlRunResponseDto>(await apiClient.POST("/api/v1/payroll/runs", { body: dto }));
}

/**
 * Valid from `DRAFT` OR `COMPUTED` (recomputable — wipes and rebuilds every
 * `pyrl_run_line` unconditionally on each call, confirmed by reading
 * `compute()` directly: `runLineRepository.deleteByRunId()` runs
 * unconditionally at the start, before any employee is even considered).
 * Real `ValidationException` verbatim otherwise (see
 * `run-status-actions.tsx`'s own doc comment).
 */
export async function computeRun(id: string): Promise<PyrlRunResponseDto> {
  return unwrapApiResult<PyrlRunResponseDto>(await apiClient.POST("/api/v1/payroll/runs/{id}/compute", { params: { path: { id } } }));
}

/** Valid from `COMPUTED` only — generates the real variance report (see `lib/run-totals.ts`'s own doc comment for its exact shape) and moves to `REVIEW`. */
export async function reviewRun(id: string): Promise<PyrlRunResponseDto> {
  return unwrapApiResult<PyrlRunResponseDto>(await apiClient.POST("/api/v1/payroll/runs/{id}/review", { params: { path: { id } } }));
}

/** Valid from `REVIEW` only — submits a REAL `appr_instance` (domain `PAYROLL_RUN`, amount = `totals.totalNetPay`) and moves to `PENDING_APPROVAL`. */
export async function submitRun(id: string): Promise<PyrlRunResponseDto> {
  return unwrapApiResult<PyrlRunResponseDto>(await apiClient.POST("/api/v1/payroll/runs/{id}/submit", { params: { path: { id } } }));
}

/**
 * Valid from `PENDING_APPROVAL` only. `approved: true` -> `APPROVED` (sets
 * `approvedBy`). `approved: false` -> back to `REVIEW` — **not a terminal
 * rejection**, `pyrl_run.status` has no `REJECTED` value at all; "returned
 * for more work" is the exact real semantic (confirmed
 * `onApprovalDecided()`, `payroll-runs.service.ts:614-635`). Same
 * manual-trigger-bypasses-the-real-`appr_instance` pattern `LoansService`'s
 * own `decide()` already established for Part 5 — `submit()` above creates a
 * genuine `appr_instance`, but this flips `pyrl_run.status` directly (with a
 * real, live-verified consequence for the `approved: false` path — see
 * `run-status-actions.tsx`'s own doc comment for the stale-PENDING-instance
 * finding and its real resolution path).
 *
 * **`DecidePyrlRunDto.approved` previously had no class-validator decorator
 * — a real bug this part found and fixed** (`packages/server/.../dto/
 * payroll-run.dto.ts`): with this app's global `whitelist: true`
 * `ValidationPipe`, an undecorated property is silently stripped from every
 * request regardless of what the client sends, so `decide()` could never
 * actually approve a run through the real API before this fix. See
 * `run-status-actions.tsx`'s own doc comment for the full finding.
 */
export async function decideRun(id: string, dto: DecidePyrlRunDto): Promise<PyrlRunResponseDto> {
  return unwrapApiResult<PyrlRunResponseDto>(
    await apiClient.POST("/api/v1/payroll/runs/{id}/decide", { params: { path: { id } }, body: dto }),
  );
}

/**
 * Phase 6 Slice 22 Part 7 (Payroll, Module 15) — the final 3 lifecycle
 * routes: `commit -> pay -> file`. Valid from `APPROVED` only. Real
 * `ValidationException`s verbatim otherwise: `` `pyrl_run ${id} cannot be
 * committed from status ${status} — only APPROVED runs may be committed` ``,
 * or `` `pyrl_run ${id} has no computed lines — nothing to commit` `` for a
 * (practically unreachable via this UI, since `APPROVED` requires a prior
 * successful `compute()`) zero-lines edge case.
 *
 * **Realizes P-27 in ONE aggregated `PostingService.post()` journal**
 * (`payroll-runs.service.ts:637-821`, read directly, not paraphrased) —
 * debits `5010 Payroll Expense` (per cost center) + `5080 Employer
 * Statutory Contributions Expense`, credits `2050`/`2060`/`2070`/`2080`/
 * `2090`/`1600 Staff Loans Receivable`/the resolved Net Pay Payable control
 * account — only lines with a positive amount are included, so a run with
 * zero of some deduction type simply omits that journal line. **Also
 * genuinely finalizes every line's loan recovery for real** — for each line
 * with `loanRecovered > 0`, re-resolves the employee's first ACTIVE loan
 * (the SAME `activeLoans[0]` selection `compute()` used — see this
 * feature's own Part 6 write-up in `docs/phase-6/PROGRESS.md` for the
 * carried-forward `activeLoans[0]`-only finding) and calls the REAL
 * `LoansService.recordRecovery()`, decrementing that loan's `balance` for
 * the first time (`compute()` itself never calls this). Throws a named
 * `ValidationException` if a line shows a positive `loanRecovered` but the
 * employee genuinely has zero active loans at commit time (settled/written
 * off between compute and commit).
 *
 * **BR-PYRL-02 — a real, clean `409`, already correctly translated
 * server-side**: `uq_pyrl_main_run_p` (at most one COMMITTED MAIN run per
 * period) surfaces as `` `pyrl_run: a COMMITTED MAIN run already exists for
 * period ${periodKey} (uq_pyrl_main_run_p, BR-PYRL-02)` ``, verbatim via
 * `ApiError.message` on a caught conflict — no translation needed here.
 */
export async function commitRun(id: string): Promise<PyrlRunResponseDto> {
  return unwrapApiResult<PyrlRunResponseDto>(await apiClient.POST("/api/v1/payroll/runs/{id}/commit", { params: { path: { id } } }));
}

/**
 * Valid from `COMMITTED` only. Real `ValidationException`s verbatim
 * otherwise: `` `pyrl_run ${id} cannot be paid from status ${status} — only
 * COMMITTED runs may be paid` ``, or `` `pyrl_run ${id} has no positive net
 * pay to disburse` `` for a genuinely-zero-net-pay run.
 *
 * **Realizes P-28 in a SEPARATE journal** — debits Net Pay Payable, credits
 * a resolved bank-disbursement account per `method`
 * (`resolveBankDisbursementAccount()`, `gl-payroll-accounts.util.ts:100-118`,
 * read directly). **Definitively confirmed a fixed CoA-code map, NOT a real
 * bank-account integration**: `BANK` -> hardcoded account code `"1020"`,
 * `CASH` -> `"1010"`, `MPESA_B2C` -> the real `MPESA_CLEARING` control
 * account — there is no parameter anywhere on this route that references a
 * specific real `bank_account` row (`PayrollModule` doesn't even import
 * `BankingModule`), confirmed by reading the util's own doc comment, which
 * names this an interim forward gap itself. **This is why
 * `pay-run-dialog.tsx` offers ONLY a method selector, deliberately no bank
 * account picker — there is nowhere for its value to go.**
 *
 * Updates every line's `paidVia`/`paidAt` — the only 2 columns
 * `trg_pyrl_run_line_immutable` leaves writable once the parent run is
 * `COMMITTED`+ (confirmed by reading the trigger's own migration).
 */
export async function payRun(id: string, dto: PayPyrlRunDto): Promise<PyrlRunResponseDto> {
  return unwrapApiResult<PyrlRunResponseDto>(
    await apiClient.POST("/api/v1/payroll/runs/{id}/pay", { params: { path: { id } }, body: dto }),
  );
}

/**
 * Valid from `PAID` only. Real `ValidationException` verbatim otherwise:
 * `` `pyrl_run ${id} cannot be filed from status ${status} — only PAID runs
 * may be filed` ``. Sets `status: FILED` — the terminal state; no further
 * lifecycle action exists on a `FILED` run (this UI renders a plain
 * informational note there instead of any button, see
 * `run-status-actions.tsx`).
 *
 * **Deliberately does NOT generate real P10/NSSF/SHIF/AHL filing
 * documents** — real filing-document generation is a deferred Reporting
 * Engine concern (Module 18, not built anywhere in this codebase),
 * confirmed by reading `file()`'s own doc comment directly
 * (`payroll-runs.service.ts:891-899`). Purely marks the period's filing
 * administratively complete — `file-run` confirm copy states this plainly,
 * never implies a document gets produced.
 */
export async function fileRun(id: string): Promise<PyrlRunResponseDto> {
  return unwrapApiResult<PyrlRunResponseDto>(await apiClient.POST("/api/v1/payroll/runs/{id}/file", { params: { path: { id } } }));
}

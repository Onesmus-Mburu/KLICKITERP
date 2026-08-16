import type {
  CreateFaDepreciationRunDto,
  DecideFaDepreciationRunDto,
  FaDepreciationLineResponseDto,
  FaDepreciationRunResponseDto,
} from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 23 Part 3 (Fixed Assets, Module 17) — thin wrapper over
 * `DepreciationRunsController`
 * (`packages/server/src/domains/fixed-assets/api/depreciation-runs.controller.ts`,
 * base `/api/v1/fixed-assets/depreciation-runs`, tag
 * `fixed-assets-depreciation-runs`). `list`/`findOne`/`listLines`/`submit`
 * all share ONE permission (`fixed-assets:depreciation:run`); `decide` needs
 * the genuinely separate, narrower `fixed-assets:depreciation:decide`; `post`
 * needs a THIRD, separate `fixed-assets:depreciation:post` — confirmed by
 * reading the controller directly, no bundled single permission here unlike
 * Categories/Transfers.
 *
 * **Zero codegen gap on either request or response side — checked directly
 * against BOTH the zod-inferred types
 * (`packages/contracts/src/domains/fixed-assets/depreciation-run.schema.ts`)
 * AND the raw `openapi-types.ts` shape, not assumed.** The raw generated
 * `FaDepreciationRunResponseDto` DOES degrade `approvalRef`/`journalId` to
 * `Record<string, never> | null` (the same nullable-without-an-explicit-
 * `type:`-hint reflection gap `assets.api.ts`'s own doc comment documents) —
 * but the zod-inferred type used directly below as this file's read-return
 * type gets both right (`z.string().nullable()`), absorbing the gap for
 * free, the same `transfers.api.ts`/`maintenance.api.ts` precedent. Every
 * request-body field (`CreateFaDepreciationRunDto.periodId`,
 * `DecideFaDepreciationRunDto.decision`) is a plain uuid/enum with an
 * explicit type hint — no cast needed anywhere in this file.
 *
 * **`list()`'s `status` query param is genuinely optional server-side
 * (`@Query("status") status?: FaDepreciationRunStatus`) but generates as a
 * REQUIRED plain `string` on the raw operation type** — the same
 * `AssetsController_list`-class query-param gap `assets.api.ts` already
 * documents; fixed the identical conditional-query-object way (omitted
 * entirely when absent, not sent as `""`).
 *
 * **Only 4 real lifecycle steps, not 5** — `create()` computes every eligible
 * asset's line in the SAME call as creating the run (no separate `compute`
 * endpoint, unlike Payroll's own run engine) — see `createDepreciationRun()`
 * below and `create-depreciation-run-dialog.tsx`'s own doc comment.
 *
 * **The real 409 on a duplicate period** (`uq_fa_depreciation_run_period_id`,
 * at most one run per `gl_period`, ever) is never pre-validated client-side —
 * no cheap "does one already exist for this period" endpoint exists beyond
 * the general list route — surfaced verbatim via `ApiError.message` by every
 * caller of `createDepreciationRun()`, the same discipline
 * `reconciliation.api.ts`'s own `uq_bank_reconciliation_account_period` 409
 * already establishes for the structurally identical one-per-period-ever
 * constraint shape.
 *
 * **`decide(APPROVE)` never changes `run.status`** — `fa_depreciation_run`
 * is a 3-value enum (`DRAFT|PENDING_APPROVAL|POSTED`, no dedicated
 * `APPROVED` value) — confirmed by reading `onApprovalDecided()` directly:
 * an APPROVE decision returns the run UNCHANGED (still `PENDING_APPROVAL`);
 * only a RETURN decision persists a change, reverting `status` to `DRAFT`.
 * `post()` independently re-verifies the real `appr_instance` status before
 * allowing posting. See `depreciation-run-status-actions.tsx`'s own doc
 * comment for how this shapes the UI.
 */
interface ListFaDepreciationRunsQueryShape {
  status?: string;
}

export interface ListFaDepreciationRunsParams {
  status?: string;
}

export async function listDepreciationRuns(params: ListFaDepreciationRunsParams = {}): Promise<FaDepreciationRunResponseDto[]> {
  const query: ListFaDepreciationRunsQueryShape = {};
  if (params.status !== undefined) query.status = params.status;
  return unwrapApiResult<FaDepreciationRunResponseDto[]>(
    await apiClient.GET("/api/v1/fixed-assets/depreciation-runs", {
      params: { query: query as unknown as Required<ListFaDepreciationRunsQueryShape> },
    }),
  );
}

export async function getDepreciationRun(id: string): Promise<FaDepreciationRunResponseDto> {
  return unwrapApiResult<FaDepreciationRunResponseDto>(
    await apiClient.GET("/api/v1/fixed-assets/depreciation-runs/{id}", { params: { path: { id } } }),
  );
}

export async function listDepreciationRunLines(id: string): Promise<FaDepreciationLineResponseDto[]> {
  return unwrapApiResult<FaDepreciationLineResponseDto[]>(
    await apiClient.GET("/api/v1/fixed-assets/depreciation-runs/{id}/lines", { params: { path: { id } } }),
  );
}

/** Creates the run at DRAFT AND computes every eligible active asset's line in this SAME call — see this file's own doc comment. Real 409 verbatim on a duplicate `periodId`. */
export async function createDepreciationRun(dto: CreateFaDepreciationRunDto): Promise<FaDepreciationRunResponseDto> {
  return unwrapApiResult<FaDepreciationRunResponseDto>(
    await apiClient.POST("/api/v1/fixed-assets/depreciation-runs", { body: dto }),
  );
}

/** No request body. Only legal from `DRAFT` — a real `ValidationException` (422) otherwise, surfaced verbatim. */
export async function submitDepreciationRun(id: string): Promise<FaDepreciationRunResponseDto> {
  return unwrapApiResult<FaDepreciationRunResponseDto>(
    await apiClient.POST("/api/v1/fixed-assets/depreciation-runs/{id}/submit", { params: { path: { id } } }),
  );
}

/** `decision: "APPROVE" | "RETURN"`. Only legal from `PENDING_APPROVAL`. APPROVE never changes `status` — see this file's own doc comment. */
export async function decideDepreciationRun(id: string, dto: DecideFaDepreciationRunDto): Promise<FaDepreciationRunResponseDto> {
  return unwrapApiResult<FaDepreciationRunResponseDto>(
    await apiClient.POST("/api/v1/fixed-assets/depreciation-runs/{id}/decide", { params: { path: { id } }, body: dto }),
  );
}

/** No request body. Only legal from `PENDING_APPROVAL` with a genuinely `APPROVED` `DEPRECIATION` `appr_instance` — realizes P-30 (one journal per category) and sets `status: POSTED`, a true terminal state (`trg_fa_depreciation_run_immutable`). */
export async function postDepreciationRun(id: string): Promise<FaDepreciationRunResponseDto> {
  return unwrapApiResult<FaDepreciationRunResponseDto>(
    await apiClient.POST("/api/v1/fixed-assets/depreciation-runs/{id}/post", { params: { path: { id } } }),
  );
}

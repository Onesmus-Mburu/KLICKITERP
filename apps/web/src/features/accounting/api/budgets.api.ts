import type {
  BudgetLineInputDto,
  BudgetLineResponseDto,
  BudgetResponseDto,
  CreateBudgetDto,
  UpdateBudgetLineDto,
} from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 17 Part 3 (Budgets, Module 7) — thin wrapper over
 * `BudgetsController` (`packages/server/src/accounting/api/budgets.controller.ts`,
 * base `/api/v1/accounting/budgets`) — every route is `accounting:budget:manage`-gated
 * EXCEPT `submit`, which is its own `accounting:budget:submit` (confirmed by
 * reading the controller directly, 164 lines).
 *
 * **Zero request-body codegen gaps here — same finding as `journals.api.ts`,
 * checked directly rather than assumed.** Every field of `CreateBudgetDto`/
 * `BudgetLineInputDto`/`UpdateBudgetLineDto` was checked against
 * `packages/contracts/src/generated/openapi-types.ts` directly: none of the
 * optional fields (`BudgetLineInputDto.costCenterId`,
 * `UpdateBudgetLineDto.periodPhasing`/`.annualAmount`) carry a Swagger
 * `default` value in their source DTOs — the specific trigger for the
 * "generated type drops the `?`" bug `accounts.api.ts`'s own doc comment
 * documents — so it doesn't fire on any of them here either.
 * `createBudget()`/`addBudgetLine()`/`updateBudgetLine()` all pass their
 * `dto` straight through with no `as unknown as` cast, confirmed by a clean
 * `tsc --noEmit`, not just reasoned about.
 *
 * **2 response-side gaps exist, but both are already covered for free.**
 * `BudgetResponseDto.approvalRef` and `BudgetLineResponseDto.costCenterId`
 * both degrade to `Record<string, never> | null` in the generated type — the
 * same `nullable`-without-an-explicit-primitive-type-hint class of bug
 * `lib/api-error.ts`'s own doc comment documents for the Students domain.
 * `unwrapApiResult<T>()`'s `data: unknown` parameter already absorbs this
 * for every READ path in this codebase, so no local-interface-plus-cast is
 * needed for either — only request BODIES ever need that pattern, and this
 * file has none to fix.
 *
 * **`fiscalYearId` is a REQUIRED query param on `list()`, not an optional
 * filter** — confirmed by reading `BudgetsController.list()`'s own
 * `@Query("fiscalYearId") fiscalYearId: string` signature (no `?`), and the
 * generated `BudgetsController_list` operation agrees
 * (`{ fiscalYearId: string }`, not optional either) — the one place in this
 * slice where the generated type happens to match the real controller
 * exactly, so `listBudgets()` needs none of `accounts.api.ts`'s/
 * `journals.api.ts`'s own conditional-query-object workaround for their
 * genuinely-optional list filters. `listBudgets()` therefore always takes a
 * real `fiscalYearId` string, never an empty-params default — callers
 * (`use-budgets.ts`'s `useBudgets()`) gate the query itself on one being
 * picked (`enabled: !!fiscalYearId`), mirroring the budgets list page's own
 * fiscal-year-scoped design.
 *
 * `deleteBudgetLine()` types its return as the real documented body
 * (`{ deleted: boolean }`, per `BudgetsController.removeLine()`'s own
 * handler) rather than `void` — a deliberate difference from
 * `deleteAccount()`'s own `void` precedent (whose generated response has NO
 * `content` typed at all server-side, `content?: never`); this endpoint's
 * generated response also has `content?: never` (same `@ApiResponse({status:
 * 200})`-with-no-`type` gap), but since `unwrapApiResult`'s `data` param is
 * `unknown` regardless, there's nothing lost by asking for the real shape
 * here instead of `void` — no caller currently reads `.deleted`, but keeping
 * it typed costs nothing and matches what the wire actually returns.
 */
export async function listBudgets(fiscalYearId: string): Promise<BudgetResponseDto[]> {
  return unwrapApiResult<BudgetResponseDto[]>(
    await apiClient.GET("/api/v1/accounting/budgets", { params: { query: { fiscalYearId } } }),
  );
}

export async function getBudget(id: string): Promise<BudgetResponseDto> {
  return unwrapApiResult<BudgetResponseDto>(await apiClient.GET("/api/v1/accounting/budgets/{id}", { params: { path: { id } } }));
}

export async function createBudget(dto: CreateBudgetDto): Promise<BudgetResponseDto> {
  return unwrapApiResult<BudgetResponseDto>(await apiClient.POST("/api/v1/accounting/budgets", { body: dto }));
}

export async function getBudgetLines(id: string): Promise<BudgetLineResponseDto[]> {
  return unwrapApiResult<BudgetLineResponseDto[]>(
    await apiClient.GET("/api/v1/accounting/budgets/{id}/lines", { params: { path: { id } } }),
  );
}

/** DRAFT-only, server-enforced with a real 422 otherwise (`BudgetsService.requireDraft()`) — `budget-line-editor.tsx` also gates this client-side on `budget.status === "DRAFT"`, but the server-side guard is the real source of truth. */
export async function addBudgetLine(budgetId: string, dto: BudgetLineInputDto): Promise<BudgetLineResponseDto> {
  return unwrapApiResult<BudgetLineResponseDto>(
    await apiClient.POST("/api/v1/accounting/budgets/{id}/lines", { params: { path: { id: budgetId } }, body: dto }),
  );
}

/** Hangs directly off `accounting/budgets/lines/{lineId}` — NOT nested under a budget id (confirmed by reading the controller directly). DRAFT-only, same server-side guard as `addBudgetLine()`. Only `periodPhasing`/`annualAmount` are editable — `accountId`/`costCenterId` are fixed at line-creation time (`UpdateBudgetLineDto` has no fields for either, confirmed against the DTO directly). */
export async function updateBudgetLine(lineId: string, dto: UpdateBudgetLineDto): Promise<BudgetLineResponseDto> {
  return unwrapApiResult<BudgetLineResponseDto>(
    await apiClient.PATCH("/api/v1/accounting/budgets/lines/{lineId}", { params: { path: { lineId } }, body: dto }),
  );
}

export async function deleteBudgetLine(lineId: string): Promise<{ deleted: boolean }> {
  return unwrapApiResult<{ deleted: boolean }>(
    await apiClient.DELETE("/api/v1/accounting/budgets/lines/{lineId}", { params: { path: { lineId } } }),
  );
}

/**
 * DRAFT -> PENDING_APPROVAL, summing every line's `annualAmount` server-side
 * and attaching a real `ApprovalEngineService.submit()` instance
 * (`domainCode: "GL_BUDGET"`). **Nothing in this codebase seeds a
 * `GL_BUDGET` `appr_workflow_def`/`appr_workflow_version`** (confirmed by
 * reading `BudgetsService`'s own doc comment directly) — a fresh install (or
 * any install where nobody has registered one via
 * `WorkflowDefinitionsService`/`WorkflowVersionsService`) will reject this
 * call with a real 422, `ValidationException("No active appr_workflow_def
 * registered for domain_code: GL_BUDGET")`. `budget-status-actions.tsx`
 * catches this specific case (message contains `"appr_workflow_def"`) and
 * shows an honest, actionable message instead of a generic error toast — see
 * that component's own doc comment, and this slice's PROGRESS.md write-up,
 * for whether a workflow happened to already exist in the local dev DB when
 * this was verified live.
 */
export async function submitBudget(id: string): Promise<BudgetResponseDto> {
  return unwrapApiResult<BudgetResponseDto>(await apiClient.POST("/api/v1/accounting/budgets/{id}/submit", { params: { path: { id } } }));
}

/**
 * PENDING_APPROVAL -> ACTIVE. Auto-supersedes the fiscal year's previous
 * ACTIVE budget, if any, in the SAME transaction (`BudgetsService.onApprovalDecided()`
 * — `uq_gl_budget_active_p`, a partial unique index, enforces exactly one
 * ACTIVE budget per fiscal year at the DB level). A manual stand-in for an
 * automatic approval-decision callback (see `BudgetsController`'s own class
 * doc comment: "no event dispatcher exists anywhere in this codebase yet")
 * — `budget-status-actions.tsx` shows a pre-flight warning (via `listBudgets()`)
 * when another ACTIVE budget already exists for this fiscal year, since this
 * call will silently supersede it without a separate confirmation step of
 * its own.
 */
export async function activateBudget(id: string): Promise<BudgetResponseDto> {
  return unwrapApiResult<BudgetResponseDto>(await apiClient.POST("/api/v1/accounting/budgets/{id}/activate", { params: { path: { id } } }));
}

/** PENDING_APPROVAL -> DRAFT. Same manual-stand-in caveat as `activateBudget()` — a rejected budget can be edited (its lines are DRAFT-editable again) and resubmitted. */
export async function rejectBudget(id: string): Promise<BudgetResponseDto> {
  return unwrapApiResult<BudgetResponseDto>(await apiClient.POST("/api/v1/accounting/budgets/{id}/reject", { params: { path: { id } } }));
}

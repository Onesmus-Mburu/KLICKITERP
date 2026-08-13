import type {
  CreateRequisitionDto,
  CreateRequisitionLineDto,
  RequisitionLineResponseDto,
  RequisitionResponseDto,
  UpdateRequisitionLineDto,
} from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 18 Part 2 (Procurement, Module 12) — thin wrapper over
 * `RequisitionsController` (`packages/server/src/domains/procurement/api/requisitions.controller.ts`,
 * base `/api/v1/procurement/requisitions`) — `procurement:requisition:view`
 * gates list/get/lines, `procurement:requisition:create` gates
 * create/addLine/updateLine/removeLine/cancel, `procurement:requisition:submit`
 * gates submit, `procurement:requisition:decide` gates approve/reject
 * (confirmed by reading the controller directly, 189 lines).
 *
 * **One real codegen gap here, the same class every prior part has found**:
 * `RequisitionsController_list`'s generated query-param type requires BOTH
 * `status` and `departmentId` as plain (non-optional) `string`s, even though
 * the real controller (`@Query("status") status?: ProcRequisitionStatus,
 * @Query("departmentId") departmentId?: string`) treats both as genuinely
 * optional. Fixed the same way `suppliers.api.ts`/`accounts.api.ts` already
 * do: `listRequisitions()` builds its query object CONDITIONALLY (each key
 * omitted entirely when absent), never padded with an empty string —
 * `RequisitionsService.list({status: undefined})` and `{status: ""}` are NOT
 * equivalent (an empty string is not a real `ProcRequisitionStatus`).
 *
 * **Zero request-body gaps** — checked `CreateRequisitionDto`/
 * `CreateRequisitionLineDto`/`UpdateRequisitionLineDto` directly against
 * `packages/contracts/src/generated/openapi-types.ts`: none of their
 * optional fields (`CreateRequisitionLineDto.itemId`/`.freeText`/
 * `.budgetLineId`, all of `UpdateRequisitionLineDto`) carry a Swagger
 * `default` value in their source DTOs — the specific trigger for the
 * "generated type drops the `?`" bug — so it doesn't fire here.
 * `createRequisition()`/`addRequisitionLine()`/`updateRequisitionLine()` all
 * pass their `dto` straight through with no `as unknown as` cast, confirmed
 * by a clean `tsc --noEmit`.
 *
 * **A real, opposite-direction gap DOES exist on `itemId`/`freeText`/
 * `budgetLineId`, but it never bites this file** — `requisition.dto.ts`'s
 * own `@ApiPropertyOptional({..., nullable: true})` decorators on all three
 * fields (both Create and Update DTOs) mean the GENERATED type correctly
 * allows `string | null` for each, but `@klickit/contracts`' own zod mirror
 * (`requisition.schema.ts`) only carries `.optional()`, never `.nullable()`
 * — the exact same class of gap `suppliers.api.ts` documented for
 * `tradingName`/`kraPin` in Part 1 (the "real" contracts type is the
 * NARROWER one here, not the generated one). This pass never needs to send
 * an explicit `null` for any of the three (per the plan's own guidance,
 * `<RequisitionLineEditor>` only ever uses `freeText`, never `itemId`, and
 * simply OMITS a field to leave it unchanged on update rather than
 * null-clearing it — see that component's own doc comment) so this gap is
 * flagged here for the record but never forced a cast.
 *
 * Response-side gaps (`RequisitionResponseDto.approvalRef`,
 * `RequisitionLineResponseDto.itemId`/`.freeText`/`.budgetLineId`, all
 * degrading to `Record<string, never> | null` in the generated type, the
 * same no-`type:-String`-hint-on-a-nullable-field class of bug
 * `lib/api-error.ts` documents for Students) need no cast anywhere here —
 * `unwrapApiResult<T>()`'s `data: unknown` parameter already absorbs them
 * for every read path.
 */
export type RequisitionStatus = "DRAFT" | "SUBMITTED" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "CONVERTED" | "CANCELLED";

interface RequisitionsListQueryShape {
  status?: string;
  departmentId?: string;
}

export interface ListRequisitionsFilters {
  status?: RequisitionStatus;
  departmentId?: string;
}

export async function listRequisitions(filters: ListRequisitionsFilters = {}): Promise<RequisitionResponseDto[]> {
  const query: RequisitionsListQueryShape = {};
  if (filters.status !== undefined) query.status = filters.status;
  if (filters.departmentId !== undefined) query.departmentId = filters.departmentId;
  return unwrapApiResult<RequisitionResponseDto[]>(
    await apiClient.GET("/api/v1/procurement/requisitions", {
      params: { query: query as unknown as Required<RequisitionsListQueryShape> },
    }),
  );
}

export async function getRequisition(id: string): Promise<RequisitionResponseDto> {
  return unwrapApiResult<RequisitionResponseDto>(
    await apiClient.GET("/api/v1/procurement/requisitions/{id}", { params: { path: { id } } }),
  );
}

export async function getRequisitionLines(id: string): Promise<RequisitionLineResponseDto[]> {
  return unwrapApiResult<RequisitionLineResponseDto[]>(
    await apiClient.GET("/api/v1/procurement/requisitions/{id}/lines", { params: { path: { id } } }),
  );
}

/** Creates a DRAFT requisition — `departmentId` + `justification` only, no `lines` field exists on `CreateRequisitionDto` (confirmed directly); lines are added afterward via `addRequisitionLine()`. `requestedBy` is never sent — the server sets it from the caller's own auth context. */
export async function createRequisition(dto: CreateRequisitionDto): Promise<RequisitionResponseDto> {
  return unwrapApiResult<RequisitionResponseDto>(await apiClient.POST("/api/v1/procurement/requisitions", { body: dto }));
}

/** DRAFT-only, server-enforced with a real 422 otherwise (`RequisitionsService.requireDraft()`) — `<RequisitionLineEditor>` also gates this client-side on `requisition.status === "DRAFT"`, but the server-side guard is the real source of truth. */
export async function addRequisitionLine(requisitionId: string, dto: CreateRequisitionLineDto): Promise<RequisitionLineResponseDto> {
  return unwrapApiResult<RequisitionLineResponseDto>(
    await apiClient.POST("/api/v1/procurement/requisitions/{id}/lines", { params: { path: { id: requisitionId } }, body: dto }),
  );
}

/** Hangs directly off `procurement/requisitions/lines/{lineId}` — NOT nested under a requisition id (confirmed by reading the controller directly). DRAFT-only, same server-side guard as `addRequisitionLine()`. */
export async function updateRequisitionLine(lineId: string, dto: UpdateRequisitionLineDto): Promise<RequisitionLineResponseDto> {
  return unwrapApiResult<RequisitionLineResponseDto>(
    await apiClient.PATCH("/api/v1/procurement/requisitions/lines/{lineId}", { params: { path: { lineId } }, body: dto }),
  );
}

export async function deleteRequisitionLine(lineId: string): Promise<{ deleted: boolean }> {
  return unwrapApiResult<{ deleted: boolean }>(
    await apiClient.DELETE("/api/v1/procurement/requisitions/lines/{lineId}", { params: { path: { lineId } } }),
  );
}

/**
 * DRAFT -> PENDING_APPROVAL. Captures the BR-PROC-02 budget snapshot and
 * attaches a real `ApprovalEngineService.submit()` instance (`domainCode:
 * "PROCUREMENT_REQUISITION"`). Rejects with a real 422 if the requisition has
 * no lines yet (`RequisitionsService.submit()`'s own `lines.length === 0`
 * guard) — `<RequisitionStatusActions>` disables the trigger client-side once
 * it knows there are no lines, but the server-side guard is the real source
 * of truth. Also rejects with a real 422
 * (`"No active appr_workflow_def registered for domain_code:
 * PROCUREMENT_REQUISITION"`) on an install where nobody has registered a
 * `PROCUREMENT_REQUISITION` workflow yet — see `<RequisitionStatusActions>`'s
 * own doc comment for how that's surfaced, and this slice's PROGRESS.md
 * write-up for whether it was actually observed live.
 */
export async function submitRequisition(id: string): Promise<RequisitionResponseDto> {
  return unwrapApiResult<RequisitionResponseDto>(
    await apiClient.POST("/api/v1/procurement/requisitions/{id}/submit", { params: { path: { id } } }),
  );
}

/** PENDING_APPROVAL -> APPROVED. A manual stand-in for the missing approval-decision dispatcher — same pattern `BudgetsController.activate()` already established (see that controller's own class doc comment). */
export async function approveRequisition(id: string): Promise<RequisitionResponseDto> {
  return unwrapApiResult<RequisitionResponseDto>(
    await apiClient.POST("/api/v1/procurement/requisitions/{id}/approve", { params: { path: { id } } }),
  );
}

/** PENDING_APPROVAL -> REJECTED. Same manual-stand-in caveat as `approveRequisition()`. */
export async function rejectRequisition(id: string): Promise<RequisitionResponseDto> {
  return unwrapApiResult<RequisitionResponseDto>(
    await apiClient.POST("/api/v1/procurement/requisitions/{id}/reject", { params: { path: { id } } }),
  );
}

/** Rejected with a real 422 if the requisition is already CONVERTED/CANCELLED/REJECTED (`RequisitionsService.cancel()`'s own guard) — otherwise (including from DRAFT/PENDING_APPROVAL/APPROVED) moves straight to CANCELLED. */
export async function cancelRequisition(id: string): Promise<RequisitionResponseDto> {
  return unwrapApiResult<RequisitionResponseDto>(
    await apiClient.POST("/api/v1/procurement/requisitions/{id}/cancel", { params: { path: { id } } }),
  );
}

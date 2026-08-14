import type { CreateStockTakeDto, DecideStockTakeDto, RecordCountsDto, StockTakeLineResponseDto, StockTakeResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import { getInstance } from "@/features/approvals/api/instances.api";
import type { InstanceDetail } from "@/features/approvals/types";

/**
 * Phase 6 Slice 19 Part 3 (Stock Takes, the last part of Module 13) — thin
 * wrapper over `StockTakesController`
 * (`packages/server/src/domains/inventory/api/stock-takes.controller.ts`,
 * base `/api/v1/inventory/stock-takes`) — create/list/get/lines/counts/submit/
 * decide/post, the module's full FR-INV-009.1 lifecycle.
 *
 * **The `POST /inventory/stock-takes` 500 this part's own first task was to
 * fix is now fixed** (`packages/server/src/domains/inventory/api/dto/stock-take.dto.ts`
 * — see `docs/phase-6/PROGRESS.md`'s own write-up for the full root-cause
 * story) — every function below was verified against the REAL, now-working
 * route, not a pre-fix assumption.
 *
 * `CreateStockTakeDto`/`RecordCountsDto`/`DecideStockTakeDto`/
 * `StockTakeResponseDto`/`StockTakeLineResponseDto`
 * (`packages/contracts/src/domains/inventory/stock-take.schema.ts`) have NO
 * class-name collision anywhere else in `packages/server/src` (grep-confirmed
 * against `class CreateStockTakeDto|class StockTakeResponseDto|...`, exactly
 * one hit each) and are flatly exported from `@klickit/contracts`'s root
 * barrel — checked every field directly against BOTH the zod-inferred
 * contracts types AND `packages/contracts/src/generated/openapi-types.ts`'s
 * raw OpenAPI-derived shapes: `CreateStockTakeDto`/`RecordCountsDto` have
 * **zero request-body codegen gaps** — every field on both is required with
 * no optional/nullable union anywhere, so there's nothing for the usual
 * "nullable field with no explicit `type` pairing" reflection gap to bite.
 * `createStockTake()`/`recordStockTakeCounts()` below pass their `dto`
 * straight through with no cast, matching `stores.api.ts`'s/`transfers.api.ts`'s
 * own "zero gaps" precedent.
 *
 * `DecideStockTakeDto` is the one exception, and a genuinely NEW direction of
 * the familiar gap: the zod-inferred contracts type (`decision: z.string()`
 * — `decide-stock-take.dto.ts`'s own class field IS narrowly typed
 * `"APPROVE" | "RETURN"`, but `generate-zod-schemas.ts` doesn't reflect
 * TypeScript union LITERAL types into a matching `z.enum([...])`, only a
 * bare `z.string()`) is WIDER than the real, correctly-narrow generated
 * `openapi-types.ts` shape (`decision: "APPROVE" | "RETURN"`, `@nestjs/swagger`
 * DOES read the `@ApiProperty({enum:[...]})` metadata correctly). A plain
 * `string` is not assignable to that literal union, so `decideStockTake()`
 * below casts through a local `DecideStockTakeRequestBody` mirroring the
 * GENERATED (narrower, correct) shape at the `apiClient.POST` call boundary
 * only — confirmed by a real `tsc --noEmit` failure before adding the cast,
 * the same "prove the gap, then cast narrowly" discipline every prior
 * `*.api.ts` file in this codebase establishes.
 *
 * `StockTakeResponseDto.approvalRef`/`.journalId` DO show the now-familiar
 * `Record<string, never> | null` degradation in the generated
 * `openapi-types.ts` shape (`@ApiProperty({ format: "uuid", nullable: true })`
 * with no explicit `type: String` pairing on either class field — the same
 * `taxTreatment`/`receivedBy` reflection gap `accounts.api.ts`/`transfers.api.ts`
 * already document) — but this is a RESPONSE-side field only, and
 * `unwrapApiResult<T>`'s own `data` parameter is typed `unknown` (see that
 * file's own doc comment), so the generated (gapped) response shape is never
 * actually checked against the real `StockTakeResponseDto` type at any of
 * this file's call sites — no cast needed, ever, on the response side.
 *
 * The list query-param gap is the now-familiar class:
 * `StockTakesController_list`'s generated `status`/`storeId` query params are
 * both required (non-optional) strings, even though the real controller
 * (`@Query("status") status?: InvStockTakeStatus`, `@Query("storeId")
 * storeId?: string`) treats both as genuinely optional. `listStockTakes()`
 * below builds the query object CONDITIONALLY, matching every other
 * `*.api.ts` file's own established fix.
 *
 * **No `APPROVED` value exists anywhere on `StockTakeResponseDto.status`**
 * (`OPEN|COUNTING|REVIEW|PENDING_APPROVAL|POSTED|CANCELLED`, confirmed by
 * reading `INV_STOCK_TAKE_STATUSES` directly) — see `getApprovalInstanceStatus()`
 * below for how Post-button readiness is actually determined instead.
 *
 * **A second genuine, previously-undocumented backend/workflow finding, found
 * live while wiring up `decide()`**: `StockTakesService.onApprovalDecided()`
 * (the handler behind `POST .../{id}/decide`) does NOT itself call
 * `ApprovalEngineService.decide()` — confirmed by reading it directly, it
 * only ever flips `inv_stock_take.status` (to `REVIEW` on RETURN; a pure
 * no-op verification on APPROVE, per its own doc comment: "post() verifies
 * via ApprovalEngineService directly"). Confirmed LIVE: calling ONLY
 * `POST /inventory/stock-takes/{id}/decide` with `{decision:"APPROVE"}`
 * leaves the real `appr_instance.status` at `PENDING` — completely
 * unchanged (`GET /approvals/instances/{id}` re-checked before AND after).
 * The REAL decision only happens via the generic approvals engine's own
 * `POST /approvals/instances/{id}/decide` (`InstancesController.decide()` ->
 * `ApprovalEngineService.decide()`). So an APPROVE/RETURN decision made
 * anywhere in THIS feature's UI (`stock-take-status-actions.tsx`) must call
 * BOTH endpoints — the real approvals decide (reusing the ALREADY-SHIPPED
 * `features/approvals/hooks/use-instances.ts`'s `useDecideInstance()`, not
 * duplicated here) to actually move `appr_instance.status`, THEN this
 * domain's own `/decide` to sync `inv_stock_take.status` (which matters for
 * RETURN's real REVIEW transition; for APPROVE it's a harmless no-op flip
 * that still re-validates `status === 'PENDING_APPROVAL'` server-side).
 * Verified end-to-end live (see PROGRESS.md): after both calls, a SECOND
 * (non-initiator) user's APPROVE genuinely moves `appr_instance.status` to
 * `APPROVED` while `inv_stock_take.status` stays `PENDING_APPROVAL` — exactly
 * the split this whole part's Post-gating design depends on.
 */
export interface ListStockTakesParams {
  status?: string;
  storeId?: string;
}

interface StockTakesListQueryShape {
  status?: string;
  storeId?: string;
}

/** Mirrors the GENERATED (narrower, correct) `openapi-types.ts` shape — see this file's own doc comment on `DecideStockTakeDto`'s codegen gap. */
interface DecideStockTakeRequestBody {
  decision: "APPROVE" | "RETURN";
}

export async function createStockTake(dto: CreateStockTakeDto): Promise<StockTakeResponseDto> {
  return unwrapApiResult<StockTakeResponseDto>(await apiClient.POST("/api/v1/inventory/stock-takes", { body: dto }));
}

export async function listStockTakes(params: ListStockTakesParams = {}): Promise<StockTakeResponseDto[]> {
  const query: StockTakesListQueryShape = {};
  if (params.status !== undefined) query.status = params.status;
  if (params.storeId !== undefined) query.storeId = params.storeId;
  return unwrapApiResult<StockTakeResponseDto[]>(
    await apiClient.GET("/api/v1/inventory/stock-takes", { params: { query: query as unknown as Required<StockTakesListQueryShape> } }),
  );
}

export async function getStockTake(id: string): Promise<StockTakeResponseDto> {
  return unwrapApiResult<StockTakeResponseDto>(await apiClient.GET("/api/v1/inventory/stock-takes/{id}", { params: { path: { id } } }));
}

/** The variance report — `snapshotQty`/`countedQty`/`varianceQty`/`varianceValue` per item in scope. */
export async function listStockTakeLines(id: string): Promise<StockTakeLineResponseDto[]> {
  return unwrapApiResult<StockTakeLineResponseDto[]>(await apiClient.GET("/api/v1/inventory/stock-takes/{id}/lines", { params: { path: { id } } }));
}

/** Batch — accepted repeatedly (a partial batch, then a follow-up batch, both merge server-side); status auto-advances OPEN->COUNTING->REVIEW once every line has a non-null `countedQty`. */
export async function recordStockTakeCounts(id: string, dto: RecordCountsDto): Promise<StockTakeResponseDto> {
  return unwrapApiResult<StockTakeResponseDto>(
    await apiClient.POST("/api/v1/inventory/stock-takes/{id}/counts", { params: { path: { id } }, body: dto }),
  );
}

/** REVIEW -> PENDING_APPROVAL, submits the STOCK_ADJUSTMENTS approval instance. */
export async function submitStockTake(id: string): Promise<StockTakeResponseDto> {
  return unwrapApiResult<StockTakeResponseDto>(await apiClient.POST("/api/v1/inventory/stock-takes/{id}/submit", { params: { path: { id } } }));
}

/** The domain-sync half of a decision — see this file's own doc comment on why the caller must ALSO call the real approvals decide (`useDecideInstance`) for the underlying `appr_instance` to actually move. */
export async function decideStockTake(id: string, dto: DecideStockTakeDto): Promise<StockTakeResponseDto> {
  return unwrapApiResult<StockTakeResponseDto>(
    await apiClient.POST("/api/v1/inventory/stock-takes/{id}/decide", { params: { path: { id } }, body: dto as unknown as DecideStockTakeRequestBody }),
  );
}

/** Requires `status==='PENDING_APPROVAL'` AND a genuinely APPROVED STOCK_ADJUSTMENTS instance (server re-verifies both) — realizes P-24. */
export async function postStockTake(id: string): Promise<StockTakeResponseDto> {
  return unwrapApiResult<StockTakeResponseDto>(await apiClient.POST("/api/v1/inventory/stock-takes/{id}/post", { params: { path: { id } } }));
}

/**
 * Thin, deliberately non-duplicating re-export of the ALREADY-SHIPPED
 * `features/approvals/api/instances.api.ts`'s `getInstance()` — checked
 * FIRST, per this part's own explicit instruction, rather than hand-rolling
 * a second `GET /approvals/instances/{id}` wrapper. `StockTakeResponseDto.approvalRef`
 * IS an `appr_instance.id` (confirmed by reading `StockTakesService.submitForApproval()`
 * directly: `stockTake.approvalRef = instance.id`), so
 * `getApprovalInstanceStatus(stockTake.approvalRef)` is exactly `getInstance(id)`
 * under a name that reads correctly at a Stock Takes call site — the ONE
 * function `<StockTakeStatusActions>` needs to answer "is Post allowed yet."
 */
export async function getApprovalInstanceStatus(approvalRef: string): Promise<InstanceDetail> {
  return getInstance(approvalRef);
}

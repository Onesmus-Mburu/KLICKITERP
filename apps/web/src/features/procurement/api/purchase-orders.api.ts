import type { CreatePurchaseOrderDto, PurchaseOrderLineResponseDto, PurchaseOrderResponseDto, RevisePurchaseOrderDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 18 Part 3 (Procurement, Module 12) — thin wrapper over
 * `PurchaseOrdersController` (`packages/server/src/domains/procurement/api/purchase-orders.controller.ts`,
 * base `/api/v1/procurement/purchase-orders`). No dedicated `...:view`
 * permission exists for this entity — every GET reuses `procurement:po:create`
 * (confirmed by reading the controller directly, 217 lines); `create`/`revise`
 * also use `procurement:po:create`, `createDirect` uses the SEPARATE
 * `procurement:po:create-direct` (BR-PROC-01's bypass escape hatch — may not
 * be granted to every role that can do everything else here), and
 * submit/decide(approve+reject)/issue each have their own dedicated
 * permission.
 *
 * **The one real `Date`-vs-string codegen gap in this file**:
 * `PurchaseOrderResponseDto.issuedAt` — `purchase-order.dto.ts`'s own
 * `@ApiProperty({ nullable: true })` with a TS-declared `Date | null` field
 * type produces a GENERATED openapi type of `Record<string, never> | null`
 * (no `type` hint Swagger can reflect from a union), but
 * `@klickit/contracts`' own zod mirror (`purchase-order.schema.ts`) declares
 * `issuedAt: z.coerce.date().nullable()` — mirroring the entity's real
 * `Date | null` TS type 1:1, NOT the wire shape. `unwrapApiResult<T>()` never
 * calls `.parse()` on any zod schema (a plain cast on the raw fetch JSON,
 * confirmed by reading it directly), so the REAL runtime value of
 * `po.issuedAt` is a STRING (or `null`), even though `PurchaseOrderResponseDto.issuedAt`'s
 * declared TS type says `Date`. This is the EXACT SAME class of gap
 * `features/payments/types.ts` already documents for `CashierSessionResponseDto.openedAt`/
 * `ChequeResponseDto.statusChangedAt` — same fix, applied here: `PurchaseOrder`
 * below overrides just this one field to `string | null`. Every purchase-order
 * component in this feature imports `PurchaseOrder`, never
 * `PurchaseOrderResponseDto` directly, and does `new Date(po.issuedAt)` at the
 * one or two call sites that need a real `Date` object — never a bare `.`
 * method call on the field itself.
 *
 * **Checked every field of `CreatePurchaseOrderDto`/`RevisePurchaseOrderDto`
 * directly against `packages/contracts/src/generated/openapi-types.ts` — zero
 * request-body gaps found**: none of either DTO's optional fields carry a
 * Swagger `default` in `purchase-order.dto.ts`, so both generated body types
 * stay correctly optional throughout — `createPurchaseOrder()`/
 * `createPurchaseOrderDirect()`/`revisePurchaseOrder()` all pass their `dto`
 * straight through with no cast.
 *
 * **One real query-param gap, the same class every prior part has found**:
 * `PurchaseOrdersController_list`'s generated query-param type requires BOTH
 * `status` and `supplierId` as plain (non-optional) `string`s, even though the
 * real controller (`@Query("status") status?: ProcPurchaseOrderStatus,
 * @Query("supplierId") supplierId?: string`) treats both as genuinely
 * optional. Fixed the same way `requisitions.api.ts`/`suppliers.api.ts`
 * already do: `listPurchaseOrders()` builds its query object CONDITIONALLY
 * (each key omitted entirely when absent).
 *
 * Every other nullable response field (`supersedesId`/`requisitionId`/
 * `quotationId`/`approvalRef`/`deliveryTerms`, `PurchaseOrderLineResponseDto.itemId`)
 * degrades to the usual `Record<string, never> | null` — needs no cast,
 * `unwrapApiResult<T>()`'s `data: unknown` parameter already absorbs it.
 */
export type PurchaseOrder = Omit<PurchaseOrderResponseDto, "issuedAt"> & { issuedAt: string | null };

export type PurchaseOrderStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "ISSUED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CLOSED"
  | "CANCELLED";

/** A PO's real number is only allocated at `issue()` time — before that, `PurchaseOrderResponseDto.number` is a `DRAFT-<uuid>` placeholder (`ProcPurchaseOrderEntity`'s own default). Every display site should check this and show an honest "Not yet issued" label instead of the raw placeholder. */
export function isDraftPlaceholderNumber(number: string): boolean {
  return number.startsWith("DRAFT-");
}

interface PurchaseOrdersListQueryShape {
  status?: string;
  supplierId?: string;
}

export interface ListPurchaseOrdersFilters {
  status?: PurchaseOrderStatus;
  supplierId?: string;
}

export async function listPurchaseOrders(filters: ListPurchaseOrdersFilters = {}): Promise<PurchaseOrder[]> {
  const query: PurchaseOrdersListQueryShape = {};
  if (filters.status !== undefined) query.status = filters.status;
  if (filters.supplierId !== undefined) query.supplierId = filters.supplierId;
  return unwrapApiResult<PurchaseOrder[]>(
    await apiClient.GET("/api/v1/procurement/purchase-orders", {
      params: { query: query as unknown as Required<PurchaseOrdersListQueryShape> },
    }),
  );
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder> {
  return unwrapApiResult<PurchaseOrder>(
    await apiClient.GET("/api/v1/procurement/purchase-orders/{id}", { params: { path: { id } } }),
  );
}

export async function getPurchaseOrderLines(id: string): Promise<PurchaseOrderLineResponseDto[]> {
  return unwrapApiResult<PurchaseOrderLineResponseDto[]>(
    await apiClient.GET("/api/v1/procurement/purchase-orders/{id}/lines", { params: { path: { id } } }),
  );
}

/** BR-PROC-01: from an APPROVED requisition (+ optionally an awarded quotation). `dto.requisitionId` must be set — the server requires it on this route even though it's a TS-optional field on the shared DTO (the direct-create route below is the only one that legitimately omits it). */
export async function createPurchaseOrder(dto: CreatePurchaseOrderDto): Promise<PurchaseOrder> {
  return unwrapApiResult<PurchaseOrder>(await apiClient.POST("/api/v1/procurement/purchase-orders", { body: dto }));
}

/** BR-PROC-01's bypass escape hatch — no requisition at all, `procurement:po:create-direct`-gated (a separate, possibly-not-granted permission — a 403 here is a real, expected outcome for some roles, not a bug). `dto.requisitionId` is ignored server-side even if supplied. */
export async function createPurchaseOrderDirect(dto: CreatePurchaseOrderDto): Promise<PurchaseOrder> {
  return unwrapApiResult<PurchaseOrder>(await apiClient.POST("/api/v1/procurement/purchase-orders/direct", { body: dto }));
}

/** DRAFT -> PENDING_APPROVAL. */
export async function submitPurchaseOrder(id: string): Promise<PurchaseOrder> {
  return unwrapApiResult<PurchaseOrder>(
    await apiClient.POST("/api/v1/procurement/purchase-orders/{id}/submit", { params: { path: { id } } }),
  );
}

/** PENDING_APPROVAL -> APPROVED. Manual stand-in for a real approval-decision dispatcher, the same interim pattern `requisitions.api.ts`'s own `approveRequisition()`/`BudgetsController.activate()` already established. */
export async function approvePurchaseOrder(id: string): Promise<PurchaseOrder> {
  return unwrapApiResult<PurchaseOrder>(
    await apiClient.POST("/api/v1/procurement/purchase-orders/{id}/approve", { params: { path: { id } } }),
  );
}

/** PENDING_APPROVAL -> DRAFT (NOT a terminal cancel — the PO can be edited and resubmitted). */
export async function rejectPurchaseOrder(id: string): Promise<PurchaseOrder> {
  return unwrapApiResult<PurchaseOrder>(
    await apiClient.POST("/api/v1/procurement/purchase-orders/{id}/reject", { params: { path: { id } } }),
  );
}

/**
 * APPROVED -> ISSUED — the `trg_proc_po_immutable` freeze point AND the
 * moment the real PO number gets allocated (a fresh number for an original
 * PO, or `${originalNumber}-R${revision}` for a revision). **If this PO's
 * `supersedesId` is set, this call ALSO auto-cancels the superseded original
 * PO in the same DB transaction** — `<PoStatusActions>`'s own issue-confirm
 * dialog surfaces this consequence explicitly before calling this, it is not
 * a side effect discovered only after the fact.
 */
export async function issuePurchaseOrder(id: string): Promise<PurchaseOrder> {
  return unwrapApiResult<PurchaseOrder>(
    await apiClient.POST("/api/v1/procurement/purchase-orders/{id}/issue", { params: { path: { id } } }),
  );
}

/**
 * FR-PROC-004.1 — only legal once the ORIGINAL PO's status is ISSUED or
 * PARTIALLY_RECEIVED (server-enforced; `<PoStatusActions>` also gates the
 * trigger client-side on the same 2 statuses). Creates a brand-new DRAFT PO
 * with `supersedesId` pointing at this one — the response is that NEW PO,
 * not the original; callers must navigate to `response.id`'s own detail page,
 * not stay on the original's (`<RevisePoDialog>` does this).
 * `dto.lines === undefined` carries the original's lines forward unchanged —
 * `<RevisePoDialog>`'s own "keep existing lines" vs "specify new lines"
 * toggle controls whether this call includes `lines` at all.
 */
export async function revisePurchaseOrder(id: string, dto: RevisePurchaseOrderDto): Promise<PurchaseOrder> {
  return unwrapApiResult<PurchaseOrder>(
    await apiClient.POST("/api/v1/procurement/purchase-orders/{id}/revise", { params: { path: { id } }, body: dto }),
  );
}

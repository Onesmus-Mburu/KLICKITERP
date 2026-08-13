import type { GrnLineResponseDto, GrnResponseDto, ReceiveGrnDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 18 Part 4 (Procurement, Module 12) — thin wrapper over
 * `GrnController` (`packages/server/src/domains/procurement/api/grn.controller.ts`,
 * base `/api/v1/procurement/grn`). No dedicated `...:view` permission exists
 * — every GET reuses `procurement:grn:receive` (confirmed by reading the
 * controller directly, 116 lines); `receive` uses that same permission,
 * `post` uses the separate `procurement:grn:post`.
 *
 * **GRN has no dedicated frontend route at all — neither list nor detail.**
 * `GrnController_list`'s `poId` query param is genuinely required (matching
 * the real controller's own `@Query("poId") poId: string`, no gap here — the
 * one query param in this whole part that's ALREADY correctly typed
 * required, unlike every other list endpoint's query params this slice has
 * found), so a "list every GRN" screen has nowhere meaningful to land — the
 * exact same "no natural top-level home" situation Part 3 documented for
 * Quotations. Unlike Quotations though, GRN doesn't even get its OWN
 * standalone route with a picker fallback: receiving/posting/viewing GRN
 * history is a real, complete workflow entirely from a PO's own detail page
 * (`purchase-orders/[id]/page.tsx`'s `<ReceiveGrnDialog>`/`<GrnList>`), since
 * a GRN is meaningless without the PO context it was received against —
 * there's no reasonable "browse all GRNs across every PO" use case this
 * slice's plan calls for.
 *
 * **The one real `Date`-vs-string codegen gap in this file**:
 * `GrnResponseDto.receivedAt` — `grn.dto.ts`'s own `@ApiProperty() receivedAt!: Date;`
 * (non-nullable, so Swagger CAN reflect a real `type: string, format:
 * date-time` schema for it, unlike `PurchaseOrderResponseDto.issuedAt`'s
 * union-typed gap) produces a CORRECT generated openapi type
 * (`receivedAt: string`) — but `@klickit/contracts`' own zod mirror
 * (`grn.schema.ts`) declares `receivedAt: z.coerce.date()`, inferring as a
 * real `Date` in the exported `GrnResponseDto` TS type (the type this file
 * actually imports and builds on, per `purchase-orders.api.ts`'s own doc
 * comment on why the zod-inferred type wins over the nested-under-`components`
 * openapi one). `unwrapApiResult<T>()` never calls `.parse()` on anything (a
 * plain cast on the raw fetch JSON), so the REAL runtime value of
 * `grn.receivedAt` is a STRING, even though the TS type says `Date` — the
 * exact same class of gap `PurchaseOrder.issuedAt`/`CashierSessionResponseDto.openedAt`
 * already document. Same fix: `Grn` below overrides just this field to
 * `string | null`... no, `string` (never null) — every GRN component in this
 * part imports `Grn`, never `GrnResponseDto` directly.
 *
 * **Checked every field of `ReceiveGrnDto`/`ReceiveGrnLineDto` directly
 * against `packages/contracts/src/generated/openapi-types.ts` — zero
 * request-body gaps found**: neither DTO's optional fields
 * (`rejectedQty`/`rejectionReason`/`notes`) carry a Swagger `default` in
 * `grn.dto.ts`, so the generated body type stays correctly optional
 * throughout — `receiveGrn()` passes its `dto` straight through with no
 * cast. `journalId`/`notes` on the response degrade to the usual
 * `Record<string, never> | null` in the RAW openapi-types (the standard
 * `@ApiProperty({nullable: true})`-without-`type:String`-on-a-union
 * reflection gap `api-error.ts` already documents) but the zod-inferred
 * `GrnResponseDto`/`GrnLineResponseDto` types this file actually uses
 * already carry the correct `string | null` — no cast needed for either.
 */
export type Grn = Omit<GrnResponseDto, "receivedAt"> & { receivedAt: string };

export const GRN_STATUSES = ["DRAFT", "POSTED"] as const;
export type GrnStatus = (typeof GRN_STATUSES)[number];

/** BR-PROC-01/BR-PROC-03 — starts a DRAFT GRN. Can be called multiple times against the same ISSUED/PARTIALLY_RECEIVED PO for a partial receipt; the server sums prior receipts per PO line and enforces the tolerance ceiling itself (see `receive-grn-dialog.tsx`'s own doc comment). */
export async function receiveGrn(dto: ReceiveGrnDto): Promise<Grn> {
  return unwrapApiResult<Grn>(await apiClient.POST("/api/v1/procurement/grn/receive", { body: dto }));
}

export async function listGrnByPo(poId: string): Promise<Grn[]> {
  return unwrapApiResult<Grn[]>(await apiClient.GET("/api/v1/procurement/grn", { params: { query: { poId } } }));
}

export async function getGrn(id: string): Promise<Grn> {
  return unwrapApiResult<Grn>(await apiClient.GET("/api/v1/procurement/grn/{id}", { params: { path: { id } } }));
}

export async function getGrnLines(id: string): Promise<GrnLineResponseDto[]> {
  return unwrapApiResult<GrnLineResponseDto[]>(
    await apiClient.GET("/api/v1/procurement/grn/{id}/lines", { params: { path: { id } } }),
  );
}

/** DRAFT -> POSTED. Realizes P-18/P-19 (a real GL journal posting) — only legal from DRAFT. */
export async function postGrn(id: string): Promise<Grn> {
  return unwrapApiResult<Grn>(await apiClient.POST("/api/v1/procurement/grn/{id}/post", { params: { path: { id } } }));
}

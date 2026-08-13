import type { CaptureSupplierInvoiceDto, ResolveMatchExceptionDto, SupplierInvoiceResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 18 Part 4 (Procurement, Module 12) — thin wrapper over
 * `SupplierInvoicesController` (`packages/server/src/domains/procurement/api/supplier-invoices.controller.ts`,
 * base `/api/v1/procurement/supplier-invoices`). `capture`/`post` use
 * `procurement:supplier-invoice:manage`; `match`/`resolveException` use the
 * separate `procurement:supplier-invoice:match`; `list`/`findOne` reuse
 * `manage` (confirmed by reading the controller directly, 128 lines — every
 * GET here is `manage`-gated, NOT `match`-gated, unlike GRN's own
 * single-permission-covers-every-GET shape).
 *
 * **One real query-param gap, the same standing class every prior part in
 * this slice has found**: `SupplierInvoicesController_list`'s generated
 * query-param type requires BOTH `status` and `supplierId` as plain
 * (non-optional) `string`s, even though the real controller
 * (`@Query("status") status?: ProcSupplierInvoiceStatus, @Query("supplierId")
 * supplierId?: string`) treats both as genuinely optional. Fixed the same way
 * `requisitions.api.ts`/`suppliers.api.ts`/`purchase-orders.api.ts` already
 * do: `listSupplierInvoices()` builds its query object CONDITIONALLY (each
 * key omitted entirely when absent).
 *
 * **No `Date`-vs-string gap here** — unlike `GrnResponseDto.receivedAt`/
 * `PurchaseOrderResponseDto.issuedAt`, `SupplierInvoiceResponseDto.invoiceDate`/
 * `.dueDate` are declared plain `@ApiProperty() invoiceDate!: string;` in
 * `supplier-invoice.dto.ts` (the entity stores them as `date` columns
 * TypeORM's own `string` transform mode returns as strings already, not
 * `Date` objects) — confirmed by reading both the DTO and the zod mirror
 * (`supplier-invoice.schema.ts`) directly: `invoiceDate: z.string()`, NO
 * `z.coerce.date()`. `SupplierInvoiceResponseDto` is used as-is throughout
 * this file, no override type needed.
 *
 * **`poId` degrades in the RAW openapi-types to `Record<string, never> |
 * null`** (the standard `@ApiProperty({nullable: true})`-without-`type`-hint
 * reflection gap `api-error.ts` already documents) but the zod-inferred
 * `SupplierInvoiceResponseDto` type this file actually imports already
 * carries the correct `poId: string | null` — no cast needed.
 *
 * **`matchVariance` has no generated shape at all** (`{[key: string]:
 * unknown} | null` in both the raw openapi type and the zod mirror,
 * `z.record(z.string(), z.unknown()).nullable()`) — see `../lib/invoice-match.ts`
 * for the hand-defined shape (read directly off `SupplierInvoicesService.matchAgainstPo()`'s
 * own `MatchVarianceResult` interface) + a defensive parser, mirroring Slice
 * 17 Part 4's `integrity-findings.ts` pattern.
 *
 * **Checked every field of `CaptureSupplierInvoiceDto`/`CaptureSupplierInvoiceLineDto`/
 * `ResolveMatchExceptionDto` directly against the generated types — zero
 * request-body gaps found**: none of the optional fields
 * (`poId`/`lines`) carry a Swagger `default` in `supplier-invoice.dto.ts`, so
 * every generated body type stays correctly optional — `captureSupplierInvoice()`/
 * `resolveSupplierInvoiceException()` both pass their `dto` straight through
 * with no cast.
 */
export const SUPPLIER_INVOICE_STATUSES = ["UNMATCHED", "MATCH_EXCEPTION", "MATCHED", "POSTED", "PAID", "PARTIALLY_PAID"] as const;
export type SupplierInvoiceStatus = (typeof SUPPLIER_INVOICE_STATUSES)[number];

interface SupplierInvoicesListQueryShape {
  status?: string;
  supplierId?: string;
}

export interface ListSupplierInvoicesFilters {
  status?: SupplierInvoiceStatus;
  supplierId?: string;
}

export async function listSupplierInvoices(filters: ListSupplierInvoicesFilters = {}): Promise<SupplierInvoiceResponseDto[]> {
  const query: SupplierInvoicesListQueryShape = {};
  if (filters.status !== undefined) query.status = filters.status;
  if (filters.supplierId !== undefined) query.supplierId = filters.supplierId;
  return unwrapApiResult<SupplierInvoiceResponseDto[]>(
    await apiClient.GET("/api/v1/procurement/supplier-invoices", {
      params: { query: query as unknown as Required<SupplierInvoicesListQueryShape> },
    }),
  );
}

export async function getSupplierInvoice(id: string): Promise<SupplierInvoiceResponseDto> {
  return unwrapApiResult<SupplierInvoiceResponseDto>(
    await apiClient.GET("/api/v1/procurement/supplier-invoices/{id}", { params: { path: { id } } }),
  );
}

/** `status` starts `UNMATCHED`. `dto.poId` omitted entirely for an ad-hoc/service invoice — see `capture-supplier-invoice-dialog.tsx`'s own doc comment. */
export async function captureSupplierInvoice(dto: CaptureSupplierInvoiceDto): Promise<SupplierInvoiceResponseDto> {
  return unwrapApiResult<SupplierInvoiceResponseDto>(
    await apiClient.POST("/api/v1/procurement/supplier-invoices", { body: dto }),
  );
}

/** FR-PROC-007.1 — only legal when `status='UNMATCHED'` AND `poId` is set. Auto-resolves to `MATCHED`/`MATCH_EXCEPTION`; see `../lib/invoice-match.ts` for the resulting `matchVariance` shape. */
export async function matchSupplierInvoice(id: string): Promise<SupplierInvoiceResponseDto> {
  return unwrapApiResult<SupplierInvoiceResponseDto>(
    await apiClient.POST("/api/v1/procurement/supplier-invoices/{id}/match", { params: { path: { id } } }),
  );
}

/** Only meaningful when `status='MATCH_EXCEPTION'`. `ACCEPT_VARIANCE` -> `MATCHED`; `REJECT` -> `UNMATCHED` (for correction/re-capture, re-matchable afterward). */
export async function resolveSupplierInvoiceException(
  id: string,
  dto: ResolveMatchExceptionDto,
): Promise<SupplierInvoiceResponseDto> {
  return unwrapApiResult<SupplierInvoiceResponseDto>(
    await apiClient.POST("/api/v1/procurement/supplier-invoices/{id}/resolve-exception", {
      params: { path: { id } },
      body: dto,
    }),
  );
}

/** MATCHED -> POSTED. Realizes P-20 (a real GL journal settling the GRN accrual + AP). */
export async function postSupplierInvoice(id: string): Promise<SupplierInvoiceResponseDto> {
  return unwrapApiResult<SupplierInvoiceResponseDto>(
    await apiClient.POST("/api/v1/procurement/supplier-invoices/{id}/post", { params: { path: { id } } }),
  );
}

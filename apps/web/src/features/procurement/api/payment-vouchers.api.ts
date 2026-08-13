import type { CreatePaymentVoucherDto, PaymentVoucherAllocationResponseDto, PaymentVoucherResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import { isDraftPlaceholderNumber } from "./purchase-orders.api";

/**
 * Phase 6 Slice 18 Part 5 (Procurement, Module 12) — thin wrapper over
 * `PaymentVouchersController` (`packages/server/src/domains/procurement/api/payment-vouchers.controller.ts`,
 * base `/api/v1/procurement/payment-vouchers`). `create`/`list`/`findOne`/
 * `listAllocations`/`submit`/`approve`/`reject` all share
 * `procurement:payment-voucher:manage`; `execute` alone uses the SEPARATE
 * `procurement:payment-voucher:execute` (confirmed by reading the controller
 * directly, 140 lines) — a role could legitimately create/approve a voucher
 * but not be allowed to actually move money, so `execute()` below is never
 * client-side hidden based on a guessed permission (see
 * `payment-voucher-status-actions.tsx`'s own doc comment for how that's
 * modeled honestly).
 *
 * **Checked every field of `CreatePaymentVoucherDto`/`CreatePaymentVoucherAllocationDto`
 * directly against `packages/contracts/src/generated/openapi-types.ts` — zero
 * request-body gaps found**: none of `payment-voucher.dto.ts`'s optional
 * fields (`bankAccountId`/`chequeLeafId`) carry a Swagger `default`, so the
 * generated body type stays correctly optional throughout —
 * `createPaymentVoucher()` passes its `dto` straight through with no cast.
 * Both fields are forward references to `bank_account`/`bank_cheque_leaf`
 * (Module 16/Banking, not built yet anywhere in this codebase — confirmed by
 * grepping for it) — every caller in this part omits them entirely, per the
 * plan's own explicit instruction; no picker exists for either.
 *
 * **Response-side fields have no gap either** — `@klickit/contracts`'s
 * zod-inferred `PaymentVoucherResponseDto` (the type this file actually
 * imports and every component builds on, per `purchase-orders.api.ts`'s own
 * doc comment on why the zod-inferred type wins over the nested-under-
 * `components` openapi one) already types `bankAccountId`/`chequeLeafId`/
 * `approvalRef`/`journalId` as `string | null` correctly — the RAW generated
 * type degrades these to the usual `Record<string, never> | null` (the
 * standard `@ApiProperty({nullable: true})`-without-`type:String`-on-a-union
 * reflection gap `api-error.ts` already documents), but that's never the type
 * actually bound here, so no cast is needed anywhere in this file. No
 * `Date`-vs-string gap either — this entity has no date-typed response field
 * at all.
 *
 * **One real query-param gap, the same standing class every prior part in
 * this slice has found**: `PaymentVouchersController_list`'s generated
 * query-param type requires BOTH `status` and `supplierId` as plain
 * (non-optional) `string`s, even though the real controller
 * (`@Query("status") status?: ProcPaymentVoucherStatus, @Query("supplierId")
 * supplierId?: string`) treats both as genuinely optional. Fixed the same way
 * every other `list*()` function in this feature folder already does:
 * `listPaymentVouchers()` builds its query object CONDITIONALLY (each key
 * omitted entirely when absent).
 */
/**
 * `PaymentVouchersService.create()`'s own `number: \`DRAFT-${voucherId...}\`` is
 * the IDENTICAL `DRAFT-<uuid>` placeholder shape `PurchaseOrdersService.createFromRequisition()`/
 * `GrnService.receive()` already use (confirmed by reading the service
 * directly) — real `number` is only allocated at `execute()` time. Re-exports
 * `purchase-orders.api.ts`'s own `isDraftPlaceholderNumber()` as-is rather
 * than duplicating the identical one-line check, the same reuse `grn.api.ts`
 * (Part 4) already established for its own identically-shaped placeholder.
 */
export { isDraftPlaceholderNumber };

export const PAYMENT_VOUCHER_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PAID", "CANCELLED"] as const;
export type PaymentVoucherStatus = (typeof PAYMENT_VOUCHER_STATUSES)[number];

export const PAYMENT_VOUCHER_METHODS = ["BANK", "CHEQUE", "MPESA", "CASH"] as const;
export type PaymentVoucherMethod = (typeof PAYMENT_VOUCHER_METHODS)[number];

interface PaymentVouchersListQueryShape {
  status?: string;
  supplierId?: string;
}

export interface ListPaymentVouchersFilters {
  status?: PaymentVoucherStatus;
  supplierId?: string;
}

export async function listPaymentVouchers(filters: ListPaymentVouchersFilters = {}): Promise<PaymentVoucherResponseDto[]> {
  const query: PaymentVouchersListQueryShape = {};
  if (filters.status !== undefined) query.status = filters.status;
  if (filters.supplierId !== undefined) query.supplierId = filters.supplierId;
  return unwrapApiResult<PaymentVoucherResponseDto[]>(
    await apiClient.GET("/api/v1/procurement/payment-vouchers", {
      params: { query: query as unknown as Required<PaymentVouchersListQueryShape> },
    }),
  );
}

export async function getPaymentVoucher(id: string): Promise<PaymentVoucherResponseDto> {
  return unwrapApiResult<PaymentVoucherResponseDto>(
    await apiClient.GET("/api/v1/procurement/payment-vouchers/{id}", { params: { path: { id } } }),
  );
}

export async function listPaymentVoucherAllocations(id: string): Promise<PaymentVoucherAllocationResponseDto[]> {
  return unwrapApiResult<PaymentVoucherAllocationResponseDto[]>(
    await apiClient.GET("/api/v1/procurement/payment-vouchers/{id}/allocations", { params: { path: { id } } }),
  );
}

/**
 * BR-PROC-04 — each allocation's `amount` is checked server-side against
 * that invoice's OWN open balance (`total - paidAmount`), requiring
 * `status IN (POSTED, PARTIALLY_PAID)`. `status` starts `DRAFT`; `total` is
 * server-derived as Σallocations, never sent directly by the caller (there is
 * no `total` field on `CreatePaymentVoucherDto` at all). `dto.bankAccountId`/
 * `.chequeLeafId` are omitted entirely by every caller — see this file's own
 * doc comment above.
 */
export async function createPaymentVoucher(dto: CreatePaymentVoucherDto): Promise<PaymentVoucherResponseDto> {
  return unwrapApiResult<PaymentVoucherResponseDto>(
    await apiClient.POST("/api/v1/procurement/payment-vouchers", { body: dto }),
  );
}

/** DRAFT -> PENDING_APPROVAL (`SUPPLIER_PAYMENTS` approval chain). */
export async function submitPaymentVoucher(id: string): Promise<PaymentVoucherResponseDto> {
  return unwrapApiResult<PaymentVoucherResponseDto>(
    await apiClient.POST("/api/v1/procurement/payment-vouchers/{id}/submit", { params: { path: { id } } }),
  );
}

/** PENDING_APPROVAL -> APPROVED. Manual stand-in for a real approval-decision dispatcher, the same interim pattern every prior part's own `approve*()` (Requisitions, POs) already established. */
export async function approvePaymentVoucher(id: string): Promise<PaymentVoucherResponseDto> {
  return unwrapApiResult<PaymentVoucherResponseDto>(
    await apiClient.POST("/api/v1/procurement/payment-vouchers/{id}/approve", { params: { path: { id } } }),
  );
}

/** PENDING_APPROVAL -> DRAFT (NOT terminal — the voucher can be corrected and resubmitted). */
export async function rejectPaymentVoucher(id: string): Promise<PaymentVoucherResponseDto> {
  return unwrapApiResult<PaymentVoucherResponseDto>(
    await apiClient.POST("/api/v1/procurement/payment-vouchers/{id}/reject", { params: { path: { id } } }),
  );
}

/**
 * APPROVED -> PAID. `procurement:payment-voucher:execute`-gated (a SEPARATE
 * permission from every other route in this file — see this file's own doc
 * comment above). Re-checks BR-PROC-04's per-allocation ceiling against each
 * invoice's CURRENT open balance (not just the balance at `create()` time),
 * realizes P-21 (one balanced GL journal: debit AP - Suppliers, credit the
 * method-resolved clearing account), increments every allocated invoice's
 * `paidAmount` and may flip its `status` to `PARTIALLY_PAID`/`PAID`, resolves
 * the voucher's real `number` (a `DRAFT-<uuid>` placeholder before this
 * point, the same "real number allocated at the consequential final step"
 * shape `PurchaseOrder`/`Grn` already established), and makes one best-effort
 * attempt to send a remittance advice email (`remittanceSent` reflects
 * whether that attempt actually succeeded — never fabricated, see
 * `PaymentVouchersService`'s own doc comment for the exact conditions).
 */
export async function executePaymentVoucher(id: string): Promise<PaymentVoucherResponseDto> {
  return unwrapApiResult<PaymentVoucherResponseDto>(
    await apiClient.POST("/api/v1/procurement/payment-vouchers/{id}/execute", { params: { path: { id } } }),
  );
}

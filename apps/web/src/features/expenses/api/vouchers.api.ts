import type { CreateVoucherDto, UpdateVoucherDto, VoucherResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 20 Part 1 (Expenses Foundations, Module 14) — thin wrapper
 * over `VouchersController` (`packages/server/src/domains/expenses/api/vouchers.controller.ts`,
 * base `/api/v1/expenses/vouchers`, realizing P-25) — `expenses:voucher:create`
 * gates create/list/get/update (confirmed by reading the controller directly,
 * 143 lines — there is no separate `:view` permission, the same "one bundled
 * permission reused across every GET" shape several other Slice 18/19
 * controllers already established), `expenses:voucher:submit` gates submit,
 * `expenses:voucher:decide` gates approve/reject, `expenses:voucher:pay`
 * gates pay.
 *
 * **`number` is a `DRAFT-<uuid-prefix>` placeholder until `pay()` actually
 * runs** — `VouchersService.create()`'s own doc comment ("Numbering") confirms
 * the real number is only allocated inside `pay()` via
 * `NumberingService.allocate(em, 'EXP_VOUCHER')`, the identical "document
 * only matters once executed" shape `PurchaseOrder`/`PaymentVoucher`/`Grn`
 * already established in Procurement (Slice 18). `isDraftPlaceholderNumber()`
 * below is a fresh, LOCAL copy of the identical one-line check those files
 * export — deliberately NOT imported across from
 * `features/procurement/api/purchase-orders.api.ts` (unlike
 * `payment-vouchers.api.ts`'s own in-module reuse of it): `exp-voucher.entity.ts`'s
 * own doc comment is explicit that `domains/procurement` is NOT in Expenses'
 * `mayImport` list on the backend side ("expenses and procurement are
 * siblings, no legitimate coupling"), and this frontend feature folder
 * mirrors that same module-boundary discipline rather than reaching across
 * siblings for a one-line function.
 *
 * **Two real request-body gaps, both against the GENERATED type** (checked
 * directly against `packages/contracts/src/generated/openapi-types.ts`, not
 * assumed from Procurement's own precedent):
 * 1. `CreateVoucherDto.payeeRef`/`UpdateVoucherDto.payeeRef` both degrade to
 *    `Record<string, never>` (not `Record<string, unknown>`) — `voucher.dto.ts`'s
 *    own `@ApiProperty({ type: Object, ... })`/`@ApiPropertyOptional({ type:
 *    Object })` decorators give Swagger no structural shape to reflect for a
 *    genuinely polymorphic field, so `openapi-typescript` emits the narrowest
 *    possible object type. `payeeRef`'s real shape varies by `payeeType`
 *    (`{supplierId}` / `{staffUserId}` / `{name, contact}` — see
 *    `create-voucher-dialog.tsx`) and is never actually assignable to
 *    `Record<string, never>` without a cast.
 * 2. `UpdateVoucherDto.costCenterId` degrades to `Record<string, never> | null`
 *    (not `string | null`) — the exact same "explicit `string | null` union
 *    on the class field defeats NestJS/Swagger's reflection" gap
 *    `categories.api.ts` (this same part) documents for
 *    `UpdateCategoryDto.parentId`, confirmed asymmetric with
 *    `CreateVoucherDto.costCenterId` (that class field has no explicit union,
 *    just `costCenterId?: string`, so reflection succeeds and the generated
 *    type stays the correct `string | null`, no gap there).
 *
 * Fixed the same established way both times: `CreateVoucherRequestBody`/
 * `UpdateVoucherRequestBody` mirror the GENERATED (gapped) shape, cast at the
 * `apiClient.POST`/`.PATCH` boundary only. Response-side
 * (`VoucherResponseDto.payeeRef`/`.costCenterId`/`.approvalRef`/`.journalId`
 * all degrade the same way) needs no cast anywhere — `unwrapApiResult<T>()`'s
 * `data: unknown` parameter already absorbs it, and the REAL, correctly-typed
 * `VoucherResponseDto` (zod-inferred, `payeeRef: Record<string, unknown>`,
 * every nullable field a plain `string | null`) is what every caller of this
 * file actually gets back.
 *
 * **One query-param gap, the same standing class every prior `*.api.ts` file
 * in this codebase already documents**: `VouchersController_list`'s generated
 * `status` query param is a plain required `string`, even though the real
 * controller (`@Query("status") status?: ExpVoucherStatus`) treats it as
 * genuinely optional. Fixed the same conditional-query-object way.
 */
export type VoucherStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PAID" | "CANCELLED";
export type VoucherPayeeType = "SUPPLIER" | "STAFF" | "OTHER";
export type VoucherMethod = "CASH" | "BANK" | "PETTY_CASH" | "MPESA" | "CHEQUE";

export const VOUCHER_STATUSES: readonly VoucherStatus[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PAID", "CANCELLED"];
export const VOUCHER_PAYEE_TYPES: readonly VoucherPayeeType[] = ["SUPPLIER", "STAFF", "OTHER"];
export const VOUCHER_METHODS: readonly VoucherMethod[] = ["CASH", "BANK", "PETTY_CASH", "MPESA", "CHEQUE"];

/** See this file's own doc comment above — a fresh, local copy of the same one-line `DRAFT-` prefix check `purchase-orders.api.ts`/`payment-vouchers.api.ts` (Procurement, Slice 18) already export, deliberately not imported across the Expenses/Procurement module boundary. */
export function isDraftPlaceholderNumber(number: string): boolean {
  return number.startsWith("DRAFT-");
}

interface VouchersListQueryShape {
  status?: string;
}

/** Mirrors `CreateVoucherDto`'s GENERATED (gapped) shape: `payeeRef` as `Record<string, never>` — see this file's own doc comment above. */
interface CreateVoucherRequestBody {
  payeeType: VoucherPayeeType;
  payeeRef: Record<string, never>;
  categoryId: string;
  costCenterId?: string | null;
  amount: string;
  method: VoucherMethod;
  narrative: string;
}

/** Mirrors `UpdateVoucherDto`'s GENERATED (gapped) shape: `payeeRef` as `Record<string, never>`, `costCenterId` as `Record<string, never> | null` — see this file's own doc comment above. */
interface UpdateVoucherRequestBody {
  payeeType?: VoucherPayeeType;
  payeeRef?: Record<string, never>;
  categoryId?: string;
  costCenterId?: Record<string, never> | null;
  amount?: string;
  method?: VoucherMethod;
  narrative?: string;
}

export async function listVouchers(status?: VoucherStatus): Promise<VoucherResponseDto[]> {
  const query: VouchersListQueryShape = {};
  if (status !== undefined) query.status = status;
  return unwrapApiResult<VoucherResponseDto[]>(
    await apiClient.GET("/api/v1/expenses/vouchers", { params: { query: query as unknown as Required<VouchersListQueryShape> } }),
  );
}

export async function getVoucher(id: string): Promise<VoucherResponseDto> {
  return unwrapApiResult<VoucherResponseDto>(await apiClient.GET("/api/v1/expenses/vouchers/{id}", { params: { path: { id } } }));
}

/** Creates a DRAFT voucher — `number` starts as a `DRAFT-<uuid-prefix>` placeholder, see this file's own doc comment. */
export async function createVoucher(dto: CreateVoucherDto): Promise<VoucherResponseDto> {
  return unwrapApiResult<VoucherResponseDto>(
    await apiClient.POST("/api/v1/expenses/vouchers", { body: dto as unknown as CreateVoucherRequestBody }),
  );
}

/** DRAFT-only, server-enforced with a real 422 otherwise (`VouchersService.requireDraft()`). No dedicated update UI ships in this part (per the task brief's own scope, only create/list/detail/status-actions) — exported for completeness/future use. */
export async function updateVoucher(id: string, dto: UpdateVoucherDto): Promise<VoucherResponseDto> {
  return unwrapApiResult<VoucherResponseDto>(
    await apiClient.PATCH("/api/v1/expenses/vouchers/{id}", {
      params: { path: { id } },
      body: dto as unknown as UpdateVoucherRequestBody,
    }),
  );
}

/**
 * DRAFT -> PENDING_APPROVAL. **BR-EXP-03**: rejects with a real 422 when
 * `amount` exceeds the Settings-configurable KES threshold (`expenses.
 * attachment_required_threshold_kes`, default 1000) and the voucher has zero
 * `file_object` attachments (`FilesService.listByEntity('exp_voucher', id)`)
 * — there is no file-upload UI in this part's own scope (per the task
 * brief), so this rejection is a real, expected outcome for a voucher over
 * the threshold, not a bug; `<VoucherStatusActions>` surfaces the server's
 * own message verbatim rather than a generic error.
 */
export async function submitVoucher(id: string): Promise<VoucherResponseDto> {
  return unwrapApiResult<VoucherResponseDto>(await apiClient.POST("/api/v1/expenses/vouchers/{id}/submit", { params: { path: { id } } }));
}

/** PENDING_APPROVAL -> APPROVED. Manual stand-in for a real approval-decision dispatcher, the same interim pattern every other approval-gated entity in this codebase already establishes (Requisitions, POs, Payment Vouchers, Budgets). */
export async function approveVoucher(id: string): Promise<VoucherResponseDto> {
  return unwrapApiResult<VoucherResponseDto>(await apiClient.POST("/api/v1/expenses/vouchers/{id}/approve", { params: { path: { id } } }));
}

/** PENDING_APPROVAL -> CANCELLED — `exp_voucher` has no dedicated REJECTED status; a rejection maps straight to the terminal CANCELLED state (confirmed by reading `VouchersService.onApprovalDecided()` directly), unlike Procurement's own PO/requisition rejections which return to DRAFT for correction. */
export async function rejectVoucher(id: string): Promise<VoucherResponseDto> {
  return unwrapApiResult<VoucherResponseDto>(await apiClient.POST("/api/v1/expenses/vouchers/{id}/reject", { params: { path: { id } } }));
}

/** APPROVED -> PAID. Realizes P-25 (one balanced GL journal — debit the category's own `glExpenseAccountId`, credit the method-resolved clearing account) and allocates the real `EXP_VOUCHER` number, replacing the `DRAFT-<uuid-prefix>` placeholder — see this file's own doc comment. */
export async function payVoucher(id: string): Promise<VoucherResponseDto> {
  return unwrapApiResult<VoucherResponseDto>(await apiClient.POST("/api/v1/expenses/vouchers/{id}/pay", { params: { path: { id } } }));
}

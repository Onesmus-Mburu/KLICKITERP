import type { AddClaimLineDto, ClaimLineResponseDto, ClaimResponseDto, CreateClaimDto, UpdateClaimLineDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import { VOUCHER_METHODS, type VoucherMethod } from "./vouchers.api";

/**
 * Phase 6 Slice 20 Part 3 (Staff Claims, Module 14) — thin wrapper over
 * `ClaimsController` (`packages/server/src/domains/expenses/api/claims.controller.ts`,
 * base `/api/v1/expenses/claims`) — `expenses:claim:create` gates
 * create/list/get/lines/addLine/updateLine/removeLine (confirmed by reading
 * the controller directly, 190 lines — one bundled permission reused across
 * every GET AND every DRAFT-only line mutation, the identical "no separate
 * view permission" shape `vouchers.api.ts` (Part 1) already established for
 * its own controller), `expenses:claim:submit` gates submit,
 * `expenses:claim:decide` gates approve/reject, `expenses:claim:reimburse`
 * gates reimburse.
 *
 * **Header + real line sub-resource, the Requisitions shape (Procurement,
 * Slice 18 Part 2), not Vouchers' own flat one-amount document (Part 1)**:
 * `create()` takes ONLY `staffUserId`/`reimburseVia` — no `lines` field
 * exists on `CreateClaimDto` at all (confirmed directly) — lines are added
 * afterward one at a time via `addClaimLine()`. Line mutations hang off
 * `expenses/claims/lines/{lineId}`, NOT nested under a claim id (confirmed
 * by reading the controller directly) — the exact same shape
 * `requisitions.api.ts`'s own `updateRequisitionLine()`/`deleteRequisitionLine()`
 * doc comment documents for its own sibling module. All 3 line mutations are
 * DRAFT-only, server-enforced with a real 422 otherwise.
 *
 * **`reimburseVia` is set once at creation and can NEVER change afterward —
 * there is no PATCH anywhere on the claim header itself** (confirmed by
 * reading `ClaimsController` directly: `create`/`list`/`findOne`/`listLines`/
 * `addLine`/`updateLine`/`removeLine`/`submit`/`approve`/`reject`/`reimburse`
 * is the COMPLETE route list, no header-update route exists). To "change"
 * `reimburseVia`, a user must create an entirely new claim — no
 * `updateClaim()` export exists here for that reason, and the UI never
 * offers a header-edit affordance that would just 404/405.
 *
 * **Every line add/edit/delete recomputes `claim.total` server-side**
 * (`ClaimsService`'s own running-total maintenance, the identical shape
 * `RequisitionsService.recomputeTotalEstimate()` already established) — this
 * file makes NO attempt to compute a total client-side; every caller
 * (`hooks/use-claims.ts`'s `useAddClaimLine()`/`useUpdateClaimLine()`/
 * `useDeleteClaimLine()`) invalidates BOTH the lines list AND the claim
 * detail query so the real, server-computed `total` is always what renders.
 *
 * **Reimburse — the critical DIRECT-vs-PAYROLL branch this part exists to
 * get right** (confirmed by reading `ClaimsService.reimburse()` directly,
 * lines 217-290): `method` is REQUIRED when `claim.reimburseVia === "DIRECT"`
 * (a real 422, `"reimburse(): a method ... is required for DIRECT
 * reimbursement"`, otherwise) and posts real cash — debits the category's own
 * expense account(s), credits a method-resolved clearing account, the same
 * P-25 shape `payVoucher()` (Part 1) already realizes. When
 * `reimburseVia === "PAYROLL"`, `method` is IGNORED ENTIRELY and the posting
 * instead credits `STAFF_REIMBURSEMENTS_PAYABLE_ACCOUNT_CODE` ("2040" — see
 * that service's own exported constant) — an ACCRUAL, not a real cash
 * movement; the liability is only actually settled later by a future Module
 * 15 payroll run. `<ClaimStatusActions>` is the caller responsible for
 * showing NO method picker at all for a PAYROLL claim (not merely making it
 * optional) and for making the accrual-vs-real-cash distinction clear in its
 * own confirm copy.
 *
 * **Two real codegen gaps, both confirmed directly against
 * `packages/contracts/src/generated/openapi-types.ts`, not assumed from any
 * prior part**:
 * 1. `ClaimsController_list`'s generated query-param type requires BOTH
 *    `staffUserId` and `status` as plain (non-optional) `string`s, even
 *    though the real controller (`@Query("staffUserId") staffUserId?: string,
 *    @Query("status") status?: ExpClaimStatus`) treats both as genuinely
 *    optional — the same standing class every prior `*.api.ts` file in this
 *    codebase already documents. Fixed the same conditional-query-object way.
 * 2. `UpdateClaimLineDto.receiptFileId` degrades to `Record<string, never> |
 *    null` (not `string | null`) — `claim.dto.ts`'s own
 *    `UpdateClaimLineDto.receiptFileId?: string | null` field carries an
 *    explicit union type, defeating NestJS/Swagger's reflection (the same
 *    `UpdateCategoryDto.parentId`/`UpdateVoucherDto.costCenterId` class of gap
 *    Part 1 already documents) — confirmed ASYMMETRIC with
 *    `AddClaimLineDto.receiptFileId` (that class field has no explicit union,
 *    just `receiptFileId?: string`, so reflection succeeds and the generated
 *    type stays the correct `string | null | undefined`, no gap there).
 *    `updateClaimLine()` is fixed the same established way: a local
 *    `UpdateClaimLineRequestBody` interface mirrors the GENERATED (gapped)
 *    shape, cast at the `apiClient.PATCH` boundary — moot in practice, since
 *    `receiptFileId` is never actually sent by this part's own
 *    `<ClaimLineEditor>` (no file-upload UI exists anywhere in this codebase
 *    yet, the same documented gap every prior Expenses part flags).
 *
 * **Zero request-body gaps everywhere else** — `CreateClaimDto`,
 * `AddClaimLineDto`, and `ReimburseClaimDto` all generate CLEANLY (checked
 * directly): none of their optional fields carry an explicit `T | null`
 * union or a Swagger `default` on a boolean, the two specific triggers for
 * this codebase's standing codegen-gap classes. `createClaim()`/
 * `addClaimLine()`/`reimburseClaim()` all pass their body straight through
 * with no `as unknown as` cast, confirmed by a clean `tsc --noEmit`.
 *
 * Response-side gaps (`ClaimResponseDto.approvalRef`,
 * `ClaimLineResponseDto.receiptFileId`, both degrading to `Record<string,
 * never> | null` in the generated type — a plain `nullable: true`
 * `@ApiProperty` with no explicit `type: String` hint, the same class of bug
 * `lib/api-error.ts` documents for Students) need no cast anywhere here —
 * `unwrapApiResult<T>()`'s `data: unknown` parameter already absorbs them for
 * every read path.
 *
 * **`method` reuses Part 1's own `VOUCHER_METHODS`/`VoucherMethod`** —
 * `ReimburseClaimDto.method` and `CreateVoucherDto.method` share the exact
 * same backend enum (`EXP_VOUCHER_METHODS`, confirmed by reading
 * `claim.dto.ts`'s own import directly: `import { EXP_VOUCHER_METHODS } from
 * "../../domain/exp-voucher.entity"`) — reused here rather than duplicated,
 * since this is an in-module reuse WITHIN `features/expenses/` (Vouchers and
 * Claims are sibling sub-domains of the SAME module), not the
 * cross-module-boundary reach Part 1's own doc comment on
 * `isDraftPlaceholderNumber()` deliberately avoided (that was specifically
 * about NOT importing across the Expenses/Procurement module boundary).
 */
export type ClaimStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REIMBURSED" | "REJECTED" | "CANCELLED";
export type ClaimReimburseVia = "PAYROLL" | "DIRECT";
export type ClaimMethod = VoucherMethod;

export const CLAIM_STATUSES: readonly ClaimStatus[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REIMBURSED", "REJECTED", "CANCELLED"];
export const CLAIM_REIMBURSE_VIA: readonly ClaimReimburseVia[] = ["PAYROLL", "DIRECT"];
export const CLAIM_METHODS: readonly ClaimMethod[] = VOUCHER_METHODS;

interface ClaimsListQueryShape {
  staffUserId?: string;
  status?: string;
}

export interface ListClaimsFilters {
  staffUserId?: string;
  status?: ClaimStatus;
}

/** Mirrors `UpdateClaimLineDto`'s GENERATED (gapped) shape: `receiptFileId` as `Record<string, never> | null` — see this file's own doc comment above. */
interface UpdateClaimLineRequestBody {
  categoryId?: string;
  description?: string;
  amount?: string;
  expenseDate?: string;
  receiptFileId?: Record<string, never> | null;
}

export async function listClaims(filters: ListClaimsFilters = {}): Promise<ClaimResponseDto[]> {
  const query: ClaimsListQueryShape = {};
  if (filters.staffUserId !== undefined) query.staffUserId = filters.staffUserId;
  if (filters.status !== undefined) query.status = filters.status;
  return unwrapApiResult<ClaimResponseDto[]>(
    await apiClient.GET("/api/v1/expenses/claims", { params: { query: query as unknown as Required<ClaimsListQueryShape> } }),
  );
}

export async function getClaim(id: string): Promise<ClaimResponseDto> {
  return unwrapApiResult<ClaimResponseDto>(await apiClient.GET("/api/v1/expenses/claims/{id}", { params: { path: { id } } }));
}

export async function getClaimLines(id: string): Promise<ClaimLineResponseDto[]> {
  return unwrapApiResult<ClaimLineResponseDto[]>(await apiClient.GET("/api/v1/expenses/claims/{id}/lines", { params: { path: { id } } }));
}

/** Creates a DRAFT claim header only — no lines at creation, see this file's own doc comment. `reimburseVia` is set once here and can never change afterward. */
export async function createClaim(dto: CreateClaimDto): Promise<ClaimResponseDto> {
  return unwrapApiResult<ClaimResponseDto>(await apiClient.POST("/api/v1/expenses/claims", { body: dto }));
}

/** DRAFT-only, server-enforced with a real 422 otherwise. Zero request-body gap — see this file's own doc comment. */
export async function addClaimLine(claimId: string, dto: AddClaimLineDto): Promise<ClaimLineResponseDto> {
  return unwrapApiResult<ClaimLineResponseDto>(
    await apiClient.POST("/api/v1/expenses/claims/{id}/lines", { params: { path: { id: claimId } }, body: dto }),
  );
}

/** Hangs directly off `expenses/claims/lines/{lineId}` — NOT nested under a claim id (confirmed by reading the controller directly). DRAFT-only, same server-side guard as `addClaimLine()`. */
export async function updateClaimLine(lineId: string, dto: UpdateClaimLineDto): Promise<ClaimLineResponseDto> {
  return unwrapApiResult<ClaimLineResponseDto>(
    await apiClient.PATCH("/api/v1/expenses/claims/lines/{lineId}", {
      params: { path: { lineId } },
      body: dto as unknown as UpdateClaimLineRequestBody,
    }),
  );
}

export async function deleteClaimLine(lineId: string): Promise<{ deleted: boolean }> {
  return unwrapApiResult<{ deleted: boolean }>(await apiClient.DELETE("/api/v1/expenses/claims/lines/{lineId}", { params: { path: { lineId } } }));
}

/** DRAFT -> PENDING_APPROVAL. Rejects with a real 422 on zero lines (`ClaimsService.submit()`'s own `lines.length === 0` guard, confirmed by reading it directly) — `<ClaimStatusActions>` also disables the trigger client-side once it knows there are no lines, but the server-side guard is the real source of truth. */
export async function submitClaim(id: string): Promise<ClaimResponseDto> {
  return unwrapApiResult<ClaimResponseDto>(await apiClient.POST("/api/v1/expenses/claims/{id}/submit", { params: { path: { id } } }));
}

/** PENDING_APPROVAL -> APPROVED. Manual stand-in for a real approval-decision dispatcher, the same interim pattern every other approval-gated entity in this codebase already establishes. */
export async function approveClaim(id: string): Promise<ClaimResponseDto> {
  return unwrapApiResult<ClaimResponseDto>(await apiClient.POST("/api/v1/expenses/claims/{id}/approve", { params: { path: { id } } }));
}

/** PENDING_APPROVAL -> REJECTED — a real, dedicated terminal status this time (unlike Vouchers' own CANCELLED-only rejection, Part 1), confirmed by reading `exp-claim.entity.ts`'s own status-enum design-decision doc comment. */
export async function rejectClaim(id: string): Promise<ClaimResponseDto> {
  return unwrapApiResult<ClaimResponseDto>(await apiClient.POST("/api/v1/expenses/claims/{id}/reject", { params: { path: { id } } }));
}

/**
 * APPROVED -> REIMBURSED. See this file's own doc comment above for the
 * DIRECT-vs-PAYROLL branching — `method` is REQUIRED (a real 422 otherwise)
 * when the claim's `reimburseVia === "DIRECT"`, IGNORED ENTIRELY when
 * `"PAYROLL"`. Also rejects with a real 422 on zero lines
 * (`ClaimsService.reimburse()`'s own `lines.length === 0` guard, the same
 * empty-claim protection `submit()` already has).
 */
export async function reimburseClaim(id: string, method?: ClaimMethod): Promise<ClaimResponseDto> {
  return unwrapApiResult<ClaimResponseDto>(
    await apiClient.POST("/api/v1/expenses/claims/{id}/reimburse", {
      params: { path: { id } },
      body: method ? { method } : {},
    }),
  );
}

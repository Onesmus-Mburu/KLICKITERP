import type { AccountResponseDto, AccountTreeNodeResponseDto, CreateAccountDto, UpdateAccountDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 17 Part 1 (Accounting Core foundations, Module 7) — thin
 * wrapper over `AccountsController`
 * (`packages/server/src/accounting/api/accounts.controller.ts`, base
 * `/api/v1/accounting/accounts`) — `accounting:account:view` gates
 * list/tree/get, `accounting:account:manage` gates create/update/deactivate/
 * activate/delete (confirmed by reading the controller directly, 105 lines).
 *
 * Real, confirmed codegen gaps hit while writing this file (all against
 * `packages/contracts/src/generated/openapi-types.ts`, NOT against
 * `@klickit/contracts`'s own zod-inferred DTOs — those stay correctly typed
 * throughout; the "loosen `unwrapApiResult`'s `data` param to `unknown`" fix
 * `lib/api-error.ts`'s own doc comment documents already covers every READ
 * path here for free, so no response-side cast is needed anywhere below,
 * only request-BODY and query-param casts):
 *
 * 1. `AccountsController_list`'s generated query-param type requires
 *    `class`/`isActive`/`parentId` as plain (non-optional) `string`s even
 *    though the real controller (`@Query("class") accountClass?:
 *    GlAccountClass`, etc.) treats all three as genuinely optional — same
 *    class of gap `features/departments/api/users-lookup.api.ts`'s own
 *    `UsersLookupQueryShape` doc comment documents. The query object itself
 *    is built CONDITIONALLY (only keys with a real value are included)
 *    rather than padded with empty strings — confirmed by reading
 *    `AccountsController.list()`'s body directly that an empty-string
 *    `isActive`/`parentId` is NOT equivalent to an absent key: `isActive
 *    === undefined ? undefined : isActive === "true"` means `isActive: ""`
 *    would resolve to `false` (filtering to INACTIVE accounts only), a
 *    real, wrong-results bug an empty-string "pad every key" approach would
 *    have silently introduced.
 * 2. `UpdateAccountDto.taxTreatment` AND `CreateAccountDto.isControl`/
 *    `CreateFiscalYearDto.periodCount` (the latter in `fiscal-years.api.ts`)
 *    all degrade in their generated REQUEST-body types — `taxTreatment` to
 *    `Record<string, never> | null` (an `openapi-typescript` limitation on
 *    a `nullable: true` property with no explicit primitive type hint),
 *    `isControl` to a plain required `boolean` (an `openapi-typescript`
 *    quirk where a Swagger `default` on an `@ApiPropertyOptional` field
 *    drops the `?` entirely) — even though the real, zod-inferred DTOs
 *    (`CreateAccountDto.isControl?: boolean`, `UpdateAccountDto.taxTreatment?:
 *    string | null`) correctly mark both optional/nullable.
 *
 *    **The fix pattern (confirmed by reading `features/departments/api/departments.api.ts`'s
 *    own `UpdateDepartmentRequestBody` precedent line-by-line, not
 *    guessed)**: the local interface used at the cast boundary must mirror
 *    the GENERATED (gapped) shape — not the "real" shape — so that the
 *    interface itself remains assignable to the generated request-body
 *    type at the actual call site; the `dto as unknown as
 *    <LocalInterface>` cast is what bridges the real (correctly-optional)
 *    `dto` value to that gapped-but-call-site-compatible shape. Getting
 *    this backwards (mirroring the "real" shape instead) still fails
 *    `tsc`, since the local interface would then itself be structurally
 *    incompatible with what `apiClient.POST`/`.PATCH` expects — caught and
 *    fixed while writing this file via a real `pnpm --filter web exec tsc
 *    --noEmit` run, not assumed correct on the first attempt.
 *
 * `deleteAccount()` returns `void`, not `{deleted: boolean}` — matches
 * `features/comms/api/optouts.api.ts`'s own `deleteOptout()` precedent:
 * `AccountsController.remove()`'s `@ApiResponse({ status: 200 })` carries no
 * `type`, so the generated response has no `content` for this operation
 * (`content?: never`) even though the real body is `{deleted: true}`. The
 * frontend only needs success (200) vs. the documented 409-has-postings
 * failure (surfaced as a real `ApiError` for the caller to branch on), never
 * the boolean itself, so typing this boundary `void` (like every other
 * DELETE wrapper in this codebase) loses nothing real.
 */
interface AccountsListQueryShape {
  class?: string;
  isActive?: string;
  parentId?: string;
}

/** Mirrors `CreateAccountDto`'s GENERATED (gapped) shape: `isControl` required (not optional) — see this file's own doc comment above. */
interface CreateAccountRequestBody {
  code: string;
  name: string;
  class: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  parentId?: string | null;
  isPostable: boolean;
  isControl: boolean;
  controlDomain?:
    | "AR_STUDENT"
    | "AR_SPONSOR"
    | "AP_SUPPLIER"
    | "WALLET"
    | "INVENTORY"
    | "PAYROLL"
    | "PREPAYMENT"
    | "MPESA_CLEARING"
    | "TRANSFER_CLEARING"
    | null;
  taxTreatment?: string | null;
}

/** Mirrors `UpdateAccountDto`'s GENERATED (gapped) shape: `taxTreatment` as `Record<string, never> | null`, not `string | null` — see this file's own doc comment above. */
interface UpdateAccountRequestBody {
  name?: string;
  isControl?: boolean;
  controlDomain?:
    | "AR_STUDENT"
    | "AR_SPONSOR"
    | "AP_SUPPLIER"
    | "WALLET"
    | "INVENTORY"
    | "PAYROLL"
    | "PREPAYMENT"
    | "MPESA_CLEARING"
    | "TRANSFER_CLEARING"
    | null;
  taxTreatment?: Record<string, never> | null;
}

export interface ListAccountsParams {
  class?: string;
  isActive?: boolean;
  /** `"null"` server-side means "root accounts only" — pass the literal string `"null"` to filter to roots, a real id to filter to one parent's children, or omit entirely for no parentId filter. */
  parentId?: string;
}

export async function listAccounts(params: ListAccountsParams = {}): Promise<AccountResponseDto[]> {
  const query: AccountsListQueryShape = {};
  if (params.class !== undefined) query.class = params.class;
  if (params.isActive !== undefined) query.isActive = String(params.isActive);
  if (params.parentId !== undefined) query.parentId = params.parentId;
  return unwrapApiResult<AccountResponseDto[]>(
    await apiClient.GET("/api/v1/accounting/accounts", { params: { query: query as unknown as Required<AccountsListQueryShape> } }),
  );
}

/** The Chart of Accounts screen's primary data source — the parent/child hierarchy, pre-assembled server-side. */
export async function getAccountsTree(): Promise<AccountTreeNodeResponseDto[]> {
  return unwrapApiResult<AccountTreeNodeResponseDto[]>(await apiClient.GET("/api/v1/accounting/accounts/tree"));
}

export async function getAccount(id: string): Promise<AccountResponseDto> {
  return unwrapApiResult<AccountResponseDto>(await apiClient.GET("/api/v1/accounting/accounts/{id}", { params: { path: { id } } }));
}

export async function createAccount(dto: CreateAccountDto): Promise<AccountResponseDto> {
  return unwrapApiResult<AccountResponseDto>(
    await apiClient.POST("/api/v1/accounting/accounts", { body: dto as unknown as CreateAccountRequestBody }),
  );
}

export async function updateAccount(id: string, dto: UpdateAccountDto): Promise<AccountResponseDto> {
  return unwrapApiResult<AccountResponseDto>(
    await apiClient.PATCH("/api/v1/accounting/accounts/{id}", { params: { path: { id } }, body: dto as unknown as UpdateAccountRequestBody }),
  );
}

export async function deactivateAccount(id: string): Promise<AccountResponseDto> {
  return unwrapApiResult<AccountResponseDto>(
    await apiClient.POST("/api/v1/accounting/accounts/{id}/deactivate", { params: { path: { id } } }),
  );
}

export async function activateAccount(id: string): Promise<AccountResponseDto> {
  return unwrapApiResult<AccountResponseDto>(
    await apiClient.POST("/api/v1/accounting/accounts/{id}/activate", { params: { path: { id } } }),
  );
}

/** Rejected with a real `409` if the account has any journal-line postings (`ChartOfAccountsService.remove()`) — callers should catch `ApiError` and branch on `status === 409` to show "deactivate instead" copy, not a generic error toast. */
export async function deleteAccount(id: string): Promise<void> {
  const result = await apiClient.DELETE("/api/v1/accounting/accounts/{id}", { params: { path: { id } } });
  unwrapApiResult<void>(result);
}

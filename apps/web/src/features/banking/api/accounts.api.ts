import type { BankAccountResponseDto, CreateBankAccountDto, UpdateBankAccountDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 21 Part 1 (Banking foundations, Module 16) — thin wrapper
 * over `AccountsController`
 * (`packages/server/src/domains/banking/api/accounts.controller.ts`, base
 * `/api/v1/banking/accounts`, tag `banking-accounts`) — a SINGLE shared
 * `banking:account:manage` permission gates ALL 4 routes, including the LIST
 * route (confirmed by reading the controller directly, 82 lines — no
 * separate read-only view permission exists anywhere on this controller).
 * This is a SEPARATE, fuller wrapper from `features/payments/api/bank-accounts.api.ts`
 * (Phase 5's own minimal read-only `listBankAccounts()`, still consumed
 * unchanged by `<BankAccountSelect>` on Payments' receipt-capture screen) —
 * that file is untouched by this part.
 *
 * **`CreateBankAccountDto` generates CLEANLY against
 * `packages/contracts/src/generated/openapi-types.ts` — zero request-body
 * gap, no cast needed at all.** Checked directly, not assumed: none of
 * `account.dto.ts`'s optional fields (`bankName`/`branch`/`accountNo`) carry
 * an explicit `T | null` union on the CREATE dto's own class fields (each is
 * a plain `@ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString()
 * bankName?: string;` — no union annotation), and neither carries a Swagger
 * `default`, so NestJS/Swagger's reflection succeeds for every field —
 * `createAccount()` below passes `dto` straight through with no cast, unlike
 * every sibling `*.api.ts` file's own `Create*RequestBody` pattern.
 *
 * **`UpdateBankAccountDto` is the OPPOSITE — a real, confirmed gap on 3
 * fields**: `bankName`/`branch`/`accountNo` all degrade to `Record<string,
 * never> | null` (not `string | null`) in the generated request-body type —
 * `account.dto.ts`'s own UPDATE dto class fields DO carry an explicit `string
 * | null` union (`bankName?: string | null;`, unlike the CREATE dto's own
 * plain `string?`), defeating reflection — the same `taxTreatment`/
 * `Record<string, never>` gap `features/accounting/api/accounts.api.ts`
 * already documents. Fixed the same way: `UpdateBankAccountRequestBody`
 * mirrors the GENERATED (gapped) shape, cast at the `apiClient.PATCH`
 * boundary. `name`/`isActive` both stay correctly optional (no union, no
 * Swagger `default` on either), so only the 3 nullable string fields need the
 * mirrored interface.
 *
 * **`kind`/`glAccountId` are NOT part of `UpdateBankAccountDto` at all** —
 * confirmed by reading `account.dto.ts`/`AccountsController.update()`
 * directly: both fields are immutable after creation, the same
 * "immutable-after-creation fields get OMITTED from the edit form, not just
 * disabled" precedent `edit-account-dialog.tsx` (Accounting, Slice 17 Part 1)
 * already established for `code`/`class`/`parentId`/`isPostable`.
 *
 * **One standing query-param gap, the usual class**:
 * `AccountsController_list__banking`'s generated query-param type requires
 * `kind`/`isActive` as plain (non-optional) `string`s even though the real
 * controller (`@Query("kind") kind?: BankAccountKind, @Query("isActive")
 * isActive?: string`) treats both as genuinely optional. Fixed the same
 * conditional-query-object way every prior `*.api.ts` file in this codebase
 * already establishes (each key omitted entirely when absent, not padded
 * with an empty string).
 *
 * **BR-BANK-01 — TWO separate unique constraints, confirmed by reading
 * `BankAccountsService.create()`/`.update()` directly, not assumed from the
 * task brief alone**: `uq_bank_account_name` (account name) AND
 * `uq_bank_account_gl_account_id` (one `bank_account` row per `gl_account`) —
 * a create attempt violating EITHER is rejected with a real `409`
 * (`ConflictException`), surfaced verbatim via `ApiError.message` by every
 * caller of `createAccount()` below. `glAccountId` is also validated
 * server-side to reference an ACTIVE, POSTABLE `gl_account`
 * (`BankAccountsService.create()`'s own check) — a `422` if not, same
 * verbatim-surfacing.
 */
interface AccountsListQueryShape {
  kind?: string;
  isActive?: string;
}

/** Mirrors `UpdateBankAccountDto`'s GENERATED (gapped) shape: `bankName`/`branch`/`accountNo` as `Record<string, never> | null`, not `string | null` — see this file's own doc comment above. */
interface UpdateBankAccountRequestBody {
  name?: string;
  bankName?: Record<string, never> | null;
  branch?: Record<string, never> | null;
  accountNo?: Record<string, never> | null;
  isActive?: boolean;
}

export interface ListBankAccountsParams {
  kind?: string;
  isActive?: boolean;
}

export async function listAccounts(params: ListBankAccountsParams = {}): Promise<BankAccountResponseDto[]> {
  const query: AccountsListQueryShape = {};
  if (params.kind !== undefined) query.kind = params.kind;
  if (params.isActive !== undefined) query.isActive = String(params.isActive);
  return unwrapApiResult<BankAccountResponseDto[]>(
    await apiClient.GET("/api/v1/banking/accounts", { params: { query: query as unknown as Required<AccountsListQueryShape> } }),
  );
}

export async function getAccount(id: string): Promise<BankAccountResponseDto> {
  return unwrapApiResult<BankAccountResponseDto>(await apiClient.GET("/api/v1/banking/accounts/{id}", { params: { path: { id } } }));
}

/** No request-body cast needed — `CreateBankAccountDto` generates cleanly, see this file's own doc comment above. BR-BANK-01's real 409/422 rejections are surfaced verbatim via `ApiError.message`, never re-validated client-side beyond the GL account picker only offering active/postable accounts (see `create-account-dialog.tsx`). */
export async function createAccount(dto: CreateBankAccountDto): Promise<BankAccountResponseDto> {
  return unwrapApiResult<BankAccountResponseDto>(await apiClient.POST("/api/v1/banking/accounts", { body: dto }));
}

/** `kind`/`glAccountId` are not accepted here at all — immutable after creation, see this file's own doc comment above. */
export async function updateAccount(id: string, dto: UpdateBankAccountDto): Promise<BankAccountResponseDto> {
  return unwrapApiResult<BankAccountResponseDto>(
    await apiClient.PATCH("/api/v1/banking/accounts/{id}", {
      params: { path: { id } },
      body: dto as unknown as UpdateBankAccountRequestBody,
    }),
  );
}

import type { BankTransferResponseDto, CreateBankTransferDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 21 Part 2 (Banking, Module 16) — thin wrapper over
 * `TransfersController` (`packages/server/src/domains/banking/api/transfers.controller.ts`,
 * base `/api/v1/banking/transfers`, tag `banking-transfers`). THREE separate
 * permissions gate this controller (confirmed by reading it directly, 122
 * lines): `banking:transfer:create` on `create`/`list`/`findOne`/`submit`
 * (yes — LIST and GET share the CREATE permission, no separate view
 * permission exists, the same shape `accounts.api.ts` (Part 1) already found
 * on `AccountsController`), `banking:transfer:decide` on `approve`/`reject`,
 * `banking:transfer:post` on `post` alone — a role could plausibly
 * create/submit transfers but never be trusted to approve or actually post
 * real money movement.
 *
 * **`CreateBankTransferDto` generates CLEANLY against
 * `packages/contracts/src/generated/openapi-types.ts` — zero request-body
 * gap, no cast needed at all.** Checked directly: `transfer.dto.ts`'s CREATE
 * dto has exactly 3 required fields (`fromAccountId`/`toAccountId`/`amount`),
 * none optional/nullable, so there's nothing for NestJS/Swagger's reflection
 * to degrade — `createTransfer()` below passes `dto` straight through, the
 * same "generates cleanly" story `CreateBankAccountDto` (Part 1) already told.
 *
 * **Response side has no gap either** — `@klickit/contracts`'s zod-inferred
 * `BankTransferResponseDto` (`packages/contracts/src/domains/banking/transfer.schema.ts`,
 * the type this file actually imports and every caller binds to) already
 * types `approvalRef`/`journalId` correctly as `string | null`. The RAW
 * generated `openapi-types.ts` schema degrades both to the usual
 * `Record<string, never> | null` (`@ApiProperty({format:"uuid", nullable:
 * true})` with no explicit `type: String` on a union — the same reflection
 * gap `lib/api-error.ts`'s own doc comment documents), but that raw type is
 * never what's bound here — see `accounts.api.ts`'s own doc comment (Part 1)
 * for the identical "raw type degrades, zod-inferred type doesn't, and the
 * zod-inferred one is what's actually imported" story.
 *
 * **One standing query-param gap, the usual class**:
 * `TransfersController_list__banking`'s generated query-param type requires
 * `status`/`accountId` as plain (non-optional) `string`s even though the real
 * controller (`@Query("status") status?: BankTransferStatus, @Query("accountId")
 * accountId?: string`) treats both as genuinely optional. Fixed the same
 * conditional-query-object way every prior `*.api.ts` file in this codebase
 * already establishes. `accountId` matches a transfer where the given account
 * is EITHER leg (`BankTransferRepository.list()`'s own doc comment: "Matches
 * transfers where the given account is either leg (from OR to)"), not just
 * `fromAccountId`.
 *
 * **BR-BANK-01's same-account rejection** — `fromAccountId === toAccountId`
 * is checked CLIENT-SIDE too (`create-transfer-dialog.tsx`'s own `canSubmit`
 * guard), purely as an early UX nicety; the REAL enforcement is entirely
 * server-side, both as `BankTransfersService.create()`'s own defense-in-depth
 * `ValidationException` AND the DB's own `ck_bank_transfer_accounts_distinct`
 * CHECK constraint (confirmed by reading `bank-transfer.entity.ts`/
 * `bank-transfers.service.ts` directly) — a real error is surfaced verbatim
 * via `ApiError.message` if it's ever hit anyway.
 *
 * **Status enum**: `BANK_TRANSFER_STATUSES` — `DRAFT | PENDING_APPROVAL |
 * APPROVED | POSTED`, confirmed against `bank-transfer.entity.ts` directly.
 * No dedicated `REJECTED`/`CANCELLED` value exists — `reject()` reverts
 * `PENDING_APPROVAL` back to `DRAFT` so the transfer can be corrected and
 * resubmitted (`BankTransfersService.onApprovalDecided()`'s own doc comment),
 * never deletes it.
 *
 * **P-32's 4-line journal** (realized by `post()`, requires `APPROVED`,
 * terminal at `POSTED`): leg 1 debits `TRANSFER_CLEARING` / credits the
 * SOURCE account's own `gl_account_id`; leg 2 debits the DESTINATION
 * account's own `gl_account_id` / credits `TRANSFER_CLEARING` again — the two
 * `TRANSFER_CLEARING` lines net to exactly zero BY CONSTRUCTION (same
 * account, opposite sides, same amount), not a separate runtime balance
 * check — confirmed by reading `BankTransfersService.post()` directly.
 * `transfer-status-actions.tsx`'s own post-confirm dialog, and the detail
 * page itself, both carry this explanation for the user.
 */
export type { BankTransferResponseDto };

export const BANK_TRANSFER_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "POSTED"] as const;
export type BankTransferStatus = (typeof BANK_TRANSFER_STATUSES)[number];

/** A transfer's real `number` is only allocated at `post()` time — before that, `BankTransferResponseDto.number` is a `DRAFT-<uuid>` placeholder (`BankTransfersService.create()`'s own default, confirmed by reading it directly — the same shape `isDraftPlaceholderNumber()` already established in Procurement/Expenses). */
export function isDraftPlaceholderNumber(number: string): boolean {
  return number.startsWith("DRAFT-");
}

interface TransfersListQueryShape {
  status?: string;
  accountId?: string;
}

export interface ListTransfersFilters {
  status?: BankTransferStatus;
  accountId?: string;
}

export async function listTransfers(filters: ListTransfersFilters = {}): Promise<BankTransferResponseDto[]> {
  const query: TransfersListQueryShape = {};
  if (filters.status !== undefined) query.status = filters.status;
  if (filters.accountId !== undefined) query.accountId = filters.accountId;
  return unwrapApiResult<BankTransferResponseDto[]>(
    await apiClient.GET("/api/v1/banking/transfers", { params: { query: query as unknown as Required<TransfersListQueryShape> } }),
  );
}

export async function getTransfer(id: string): Promise<BankTransferResponseDto> {
  return unwrapApiResult<BankTransferResponseDto>(await apiClient.GET("/api/v1/banking/transfers/{id}", { params: { path: { id } } }));
}

/** Server-side BR-BANK-01 (see this file's own doc comment) is the real enforcement of `fromAccountId !== toAccountId` — surfaced verbatim via `ApiError.message` if hit. */
export async function createTransfer(dto: CreateBankTransferDto): Promise<BankTransferResponseDto> {
  return unwrapApiResult<BankTransferResponseDto>(await apiClient.POST("/api/v1/banking/transfers", { body: dto }));
}

/** DRAFT -> PENDING_APPROVAL (`BANK_TRANSFERS` approval chain). */
export async function submitTransfer(id: string): Promise<BankTransferResponseDto> {
  return unwrapApiResult<BankTransferResponseDto>(await apiClient.POST("/api/v1/banking/transfers/{id}/submit", { params: { path: { id } } }));
}

/** PENDING_APPROVAL -> APPROVED. Manual stand-in for a real approval-decision dispatcher, the same interim pattern every prior part's own `approve*()` already established. */
export async function approveTransfer(id: string): Promise<BankTransferResponseDto> {
  return unwrapApiResult<BankTransferResponseDto>(await apiClient.POST("/api/v1/banking/transfers/{id}/approve", { params: { path: { id } } }));
}

/** PENDING_APPROVAL -> DRAFT (NOT terminal — no dedicated REJECTED status exists on this 4-value enum; the transfer can be corrected and resubmitted). */
export async function rejectTransfer(id: string): Promise<BankTransferResponseDto> {
  return unwrapApiResult<BankTransferResponseDto>(await apiClient.POST("/api/v1/banking/transfers/{id}/reject", { params: { path: { id } } }));
}

/** APPROVED -> POSTED. Realizes P-32's 4-line `TRANSFER_CLEARING` journal — see this file's own doc comment for the exact mechanism. */
export async function postTransfer(id: string): Promise<BankTransferResponseDto> {
  return unwrapApiResult<BankTransferResponseDto>(await apiClient.POST("/api/v1/banking/transfers/{id}/post", { params: { path: { id } } }));
}

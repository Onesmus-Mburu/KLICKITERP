import type { WalletListResponseDto, WalletResponseDto, domains_wallet_wallet_transaction_schema } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import { optionalQuery } from "./query-params";

/**
 * `TopUpDto`/`SpendDto`/`TransferToFeesDto`/`SetWalletStatusDto`-adjacent
 * transaction DTOs/`WalletTransactionResponseDto`/`CloseWalletDto` are NOT
 * flatly exported from `@klickit/contracts`'s root barrel —
 * `wallet-transaction.schema.ts`'s own class names collide with an
 * already-claimed name elsewhere in the generated schema universe, so the
 * codegen re-exports the whole file under a namespace instead
 * (`packages/contracts/src/index.ts`'s own doc comment: "some entries are
 * namespaced instead of flat ... duplicate DTO class names across unrelated
 * modules"). Reached via the namespace here rather than a deep
 * `@klickit/contracts/domains/wallet/wallet-transaction.schema` import (also
 * valid per that file's doc comment, but this app has no existing precedent
 * for a deep contracts import anywhere — the namespace stays inside the one
 * already-established barrel entry point). `WalletResponseDto`/
 * `WalletListResponseDto` (`wallet.schema.ts`) have NO such collision — they
 * ARE flatly exported, confirmed by reading `packages/contracts/src/index.ts`
 * directly (`export * from "./domains/wallet/wallet.schema"`, unlike the
 * `export * as domains_wallet_wallet_transaction_schema` line right above
 * it), so they're imported directly above.
 */
type TopUpDto = domains_wallet_wallet_transaction_schema.TopUpDto;
type SpendDto = domains_wallet_wallet_transaction_schema.SpendDto;
type TransferToFeesDto = domains_wallet_wallet_transaction_schema.TransferToFeesDto;
type TransferToWalletDto = domains_wallet_wallet_transaction_schema.TransferToWalletDto;
type RefundWalletDto = domains_wallet_wallet_transaction_schema.RefundWalletDto;
type AdjustWalletDto = domains_wallet_wallet_transaction_schema.AdjustWalletDto;
type CloseWalletDto = domains_wallet_wallet_transaction_schema.CloseWalletDto;
type WalletTransactionResponseDto = domains_wallet_wallet_transaction_schema.WalletTransactionResponseDto;
type TransferToWalletResponseDto = domains_wallet_wallet_transaction_schema.TransferToWalletResponseDto;
type WalletApprovalRequestResponseDto = domains_wallet_wallet_transaction_schema.WalletApprovalRequestResponseDto;
type SweepToInvoicesDto = domains_wallet_wallet_transaction_schema.SweepToInvoicesDto;
type SweepToInvoicesResponseDto = domains_wallet_wallet_transaction_schema.SweepToInvoicesResponseDto;

/**
 * Thin wrapper over `WalletsController`/`WalletTransactionsController`
 * (`packages/server/src/domains/wallet/api/*.controller.ts`). Phase 6 Slice
 * 8 first touched this file (`findWalletByStudent()`/`transferToFees()`
 * only, for the bulk "Generate Invoice" screen's "collect from wallet"
 * checkbox). Phase 6 Slice 11 (Part 2) grew this file out into the full
 * list/detail/core-transactions surface this feature folder's own doc
 * comment always said a later dispatch would add.
 *
 * **Real bug fix (post-Slice-11)**: `findWalletByStudent()` did NOT
 * previously coerce an empty-body response to `null` — `WalletsController
 * .findByStudent()` (`packages/server/src/domains/wallet/api/wallets.controller.ts`)
 * returns `wallet ? toView(wallet) : null`, and per the SAME confirmed
 * behavior `features/payments/api/sessions.api.ts`'s own `getMySession()`
 * doc comment already documents at length: NestJS does not serialize a
 * `null` return value as the JSON text `"null"` — it sends a genuinely
 * EMPTY body (`Content-Length: 0`, no `Content-Type`), which `openapi-fetch`
 * cannot parse as JSON, resolving `result.data` to `undefined`, not `null`.
 * Left uncoerced, that `undefined` trips TanStack Query's own guard against
 * a queryFn resolving to `undefined` — surfacing as a false "Couldn't load
 * this / data is undefined" error on the student page's Wallet card even
 * though "no wallet provisioned yet" is a perfectly valid, expected result.
 * Fixed the identical way `getMySession()` already established: coerce at
 * this one call site, which alone knows this endpoint's specific
 * empty-body-means-null contract — not a change to `unwrapApiResult()`
 * itself.
 */
export async function findWalletByStudent(studentId: string): Promise<WalletResponseDto | null> {
  const data = await unwrapApiResult<WalletResponseDto | undefined>(
    await apiClient.GET("/api/v1/wallets/students/{studentId}", { params: { path: { studentId } } }),
  );
  return data ?? null;
}

export async function transferToFees(walletId: string, dto: TransferToFeesDto): Promise<WalletTransactionResponseDto> {
  return unwrapApiResult<WalletTransactionResponseDto>(
    await apiClient.POST("/api/v1/wallets/{id}/transfer-to-fees", { params: { path: { id: walletId } }, body: dto }),
  );
}

/**
 * Phase 6 Slice 12 (Part B) — `POST wallets/{id}/sweep-to-invoices`
 * (`WalletTransactionsController.sweepToInvoices()`, added by Part A). Sweeps
 * this wallet's available balance across the given, CALLER-ORDERED
 * (oldest-due-first) `invoiceIds` in one call, stopping the moment the
 * wallet runs out — replaces the naive per-invoice `transferToFees()` loop
 * `bulk-generate-invoice-form.tsx`'s `runWalletCollection()` used before this
 * pass. `approvalRef` is only required once the AGGREGATE swept total
 * exceeds the transfer approval threshold — submitted via the EXISTING
 * `requestTransferToFees()` above (there is no separate
 * `.../sweep-to-invoices/request` endpoint; see that function's own doc
 * comment and `wallet-transactions.controller.ts`'s doc comment on
 * `sweepToInvoices()` for why the same `(WALLET_TRANSFER, walletId)`
 * approval instance is valid for either execute path).
 * `response.receiptId`/`.transactionId` are `null` only when `totalSwept` is
 * `"0.0000"` (nothing was available to sweep — e.g. an empty wallet; still a
 * real `201`, not a thrown error, with `shortfall` populated for every
 * invoice given).
 */
export async function sweepToInvoices(walletId: string, dto: SweepToInvoicesDto): Promise<SweepToInvoicesResponseDto> {
  return unwrapApiResult<SweepToInvoicesResponseDto>(
    await apiClient.POST("/api/v1/wallets/{id}/sweep-to-invoices", { params: { path: { id: walletId } }, body: dto }),
  );
}

/**
 * Phase 6 Slice 11 (Part 2) — the new Wallets list screen.
 * `WalletsController_list`'s generated query-param type only declares
 * `q?: string` (drops `page`/`pageSize`/`sortBy`/`sortDir` entirely, the
 * same un-decorated-`@Query()`-object codegen gap `listPendingInvoices()`/
 * `listUpcomingInvoices()` (`features/billing/api/invoices.api.ts`) already
 * documented — confirmed again here, not assumed) — `optionalQuery()`'s
 * return type isn't tied to the endpoint's declared query shape, so passing
 * `page`/`pageSize` still type-checks and the real backend genuinely reads
 * them.
 */
export interface ListWalletsParams {
  page?: number;
  pageSize?: number;
  /** ILIKE match against the joined student's name or admission number; omitted (not sent) below 2 characters by the caller, mirroring the Pending/Upcoming/Receipts screens' own convention. */
  q?: string;
}

export async function listWallets(params: ListWalletsParams = {}): Promise<WalletListResponseDto> {
  return unwrapApiResult<WalletListResponseDto>(
    await apiClient.GET("/api/v1/wallets", {
      params: {
        query: optionalQuery({
          page: params.page !== undefined ? String(params.page) : undefined,
          pageSize: params.pageSize !== undefined ? String(params.pageSize) : undefined,
          q: params.q,
        }),
      },
    }),
  );
}

export async function getWallet(id: string): Promise<WalletResponseDto> {
  return unwrapApiResult<WalletResponseDto>(await apiClient.GET("/api/v1/wallets/{id}", { params: { path: { id } } }));
}

/**
 * `POST wallets/students/{studentId}` (get-or-create, `wallet:wallet:manage`)
 * — no wrapper existed for this endpoint before this pass (only the
 * `GET`-based `findWalletByStudent()` did, deliberately, per that function's
 * own doc comment). This is the real "Create wallet" button's call on the
 * student detail page's new Wallet card.
 */
export async function getOrCreateWalletForStudent(studentId: string): Promise<WalletResponseDto> {
  return unwrapApiResult<WalletResponseDto>(
    await apiClient.POST("/api/v1/wallets/students/{studentId}", { params: { path: { studentId } } }),
  );
}

export interface SetWalletStatusInput {
  status: "ACTIVE" | "LOCKED" | "FROZEN";
  reason?: string;
}

export async function setWalletStatus(id: string, dto: SetWalletStatusInput): Promise<WalletResponseDto> {
  return unwrapApiResult<WalletResponseDto>(
    await apiClient.POST("/api/v1/wallets/{id}/status", { params: { path: { id } }, body: dto }),
  );
}

export interface UpdateWalletLimitsInput {
  dailyLimit?: string | null;
  txnLimit?: string | null;
  categoryBlocks?: string[];
}

/**
 * Two real, confirmed codegen gaps, fixed the same way Slice 11 (Part 1)'s
 * `custom-fields.api.ts` fixed the identical class of gap: a targeted
 * `as unknown as {...}` cast at the one call boundary that hits it, matching
 * the REAL generated request shape field-for-field (not the DTO type openapi-fetch
 * expects, which is wrong in both cases below) — not a runtime bug, the real
 * JSON round-trips correctly either way.
 *
 *  - `UpdateWalletLimitsRequestBody` — `UpdateWalletLimitsDto.dailyLimit`/
 *    `.txnLimit` are real `string | null` fields server-side (`null` clears
 *    the limit — confirmed directly in `wallet.dto.ts`), but
 *    `@nestjs/swagger` can't express `nullable` on a bare `string | null`
 *    property without an explicit `type` (the same annotation gap
 *    `lib/api-error.ts`'s own doc comment documents elsewhere), so the
 *    generated OpenAPI-derived body type drops `null` from the union.
 *  - `SpendRequestBody` — a genuinely DIFFERENT and more serious gap: the
 *    real backend boot log warns `Duplicate DTO detected: "SpendDto" is
 *    defined multiple times with different schemas` — confirmed by reading
 *    `domains/expenses/api/dto/petty-cash.dto.ts` directly, which ALSO
 *    declares a class literally named `SpendDto` (unrelated: petty-cash
 *    spend, `{categoryId, amount, receiptFileId?}`). `@nestjs/swagger`'s
 *    component-schema registry keys purely by class NAME, so ONE of the two
 *    silently overwrites the other in the generated OpenAPI document's
 *    `components.schemas.SpendDto` — `openapi-typescript` then generates the
 *    WRONG body shape for this wallet endpoint (the petty-cash one,
 *    `categoryId`/`receiptFileId`, confirmed by reading the actual `tsc`
 *    error this produced). This is a genuine, pre-existing, NestJS-flagged
 *    cross-module naming collision (unrelated to this dispatch's own
 *    `WallWalletRepository`/`WalletsController` changes) — fixed here on the
 *    frontend, same as every other such gap in this codebase; NOT fixed by
 *    renaming either server-side `SpendDto` class, which is out of this
 *    dispatch's scope and would be a real, if cosmetic, behavior-neutral
 *    rename affecting Module 15 (Expenses) too.
 */
// These two interfaces deliberately match the WRONG/generated shape
// `apiClient.POST`'s inferred body type expects (confirmed directly against
// the actual `tsc` errors each produced) — NOT the real correct shape
// (`UpdateWalletLimitsInput`/`SpendDto` above), which is what the `as
// unknown as` cast at each call site below actually carries at runtime. This
// is the same "cast to the generated type just to satisfy the checker, real
// data flows through unchanged" shape `custom-fields.api.ts`'s own
// `CreateCustomFieldRequestBody`/`UpdateCustomFieldRequestBody` established.
interface UpdateWalletLimitsRequestBody {
  dailyLimit?: string;
  txnLimit?: string;
  categoryBlocks?: ("TRANSPORT" | "LIBRARY" | "SHOP" | "MEALS" | "PRINTING" | "TRIPS" | "ACTIVITIES" | "EMERGENCY" | "CUSTOM")[];
}
interface SpendRequestBody {
  categoryId: string;
  amount: string;
  receiptFileId?: string | null;
}

export async function updateWalletLimits(id: string, dto: UpdateWalletLimitsInput): Promise<WalletResponseDto> {
  return unwrapApiResult<WalletResponseDto>(
    await apiClient.POST("/api/v1/wallets/{id}/limits", { params: { path: { id } }, body: dto as unknown as UpdateWalletLimitsRequestBody }),
  );
}

export async function topUpWallet(id: string, dto: TopUpDto): Promise<WalletTransactionResponseDto> {
  return unwrapApiResult<WalletTransactionResponseDto>(
    await apiClient.POST("/api/v1/wallets/{id}/topup", { params: { path: { id } }, body: dto }),
  );
}

export async function spendWallet(id: string, dto: SpendDto): Promise<WalletTransactionResponseDto> {
  return unwrapApiResult<WalletTransactionResponseDto>(
    await apiClient.POST("/api/v1/wallets/{id}/spend", { params: { path: { id } }, body: dto as unknown as SpendRequestBody }),
  );
}

export async function closeWallet(id: string, dto: CloseWalletDto): Promise<WalletResponseDto> {
  return unwrapApiResult<WalletResponseDto>(
    await apiClient.POST("/api/v1/wallets/{id}/close", { params: { path: { id } }, body: dto }),
  );
}

/** `GET wallets/{id}/transactions` — genuinely unpaginated per the real backend (`WalletTransactionsController.listTransactions()` returns a plain array, no `{items,total}` envelope) — confirmed by reading that controller directly, not assumed. Newest first (the backend's own ordering). */
export async function listWalletTransactions(id: string): Promise<WalletTransactionResponseDto[]> {
  return unwrapApiResult<WalletTransactionResponseDto[]>(
    await apiClient.GET("/api/v1/wallets/{id}/transactions", { params: { path: { id } } }),
  );
}

/**
 * Phase 6 Slice 11 (Part 3) — approval-gated transactions
 * (`WalletTransactionsController`, read in full before building this).
 *
 * `transferToFees()`/`findWalletByStudent()` above stay byte-for-byte
 * unchanged (Slice 8/Part 2's own established discipline). Everything below
 * is new.
 *
 * **A real, confirmed backend DTO-reuse gap, worked around here (not fixed
 * server-side — out of scope, no backend changes this pass)**: `POST
 * .../refund/request` and `POST .../adjust/request` are typed
 * `@Body() dto: RefundWalletDto` / `AdjustWalletDto` — the SAME class the
 * EXECUTE endpoints use — so the global `ValidationPipe` (`whitelist: true`,
 * no `skipMissingProperties`, confirmed in `apps/api/src/app.module.ts`)
 * genuinely rejects a request-step call that omits `payoutMethod`/
 * `payoutTarget`/`approvalRef` (refund) or `direction`/`reasonCode`/
 * `approvalRef` (adjust) with a real 400, even though the request-step
 * HANDLER only ever reads `dto.amount` (confirmed by reading
 * `requestRefund()`/`requestAdjust()` directly — `approvalRef` is
 * `@IsUUID()`-format-checked but never referenced in either handler body).
 * Live-probed against the running API before writing this (`POST
 * .../refund/request {amount}` alone → real `400`, `fields: [{field:
 * "payoutMethod", ...}, {field: "approvalRef", message: "approvalRef must be
 * a UUID"}]`). Worked around by having the REQUEST dialogs collect the real
 * intended `payoutMethod`/`payoutTarget`/`direction`/`reasonCode` up front
 * (genuinely useful — the user is describing what they're asking permission
 * for) and sending a random `crypto.randomUUID()` as a `approvalRef`
 * placeholder that satisfies the format check but is provably never read
 * server-side for this call.
 */
export async function requestTransferToFees(id: string, dto: TransferToFeesDto): Promise<WalletApprovalRequestResponseDto> {
  return unwrapApiResult<WalletApprovalRequestResponseDto>(
    await apiClient.POST("/api/v1/wallets/{id}/transfer-to-fees/request", { params: { path: { id } }, body: dto }),
  );
}

export async function requestTransferToWallet(id: string, dto: TransferToWalletDto): Promise<WalletApprovalRequestResponseDto> {
  return unwrapApiResult<WalletApprovalRequestResponseDto>(
    await apiClient.POST("/api/v1/wallets/{id}/transfer-to-wallet/request", { params: { path: { id } }, body: dto }),
  );
}

export async function transferToWallet(id: string, dto: TransferToWalletDto): Promise<TransferToWalletResponseDto> {
  return unwrapApiResult<TransferToWalletResponseDto>(
    await apiClient.POST("/api/v1/wallets/{id}/transfer-to-wallet", { params: { path: { id } }, body: dto }),
  );
}

/** See this section's own doc comment above re: the `approvalRef` placeholder — never read server-side for `.../request`. */
export async function requestRefund(id: string, dto: RefundWalletDto): Promise<WalletApprovalRequestResponseDto> {
  return unwrapApiResult<WalletApprovalRequestResponseDto>(
    await apiClient.POST("/api/v1/wallets/{id}/refund/request", { params: { path: { id } }, body: dto }),
  );
}

export async function refundWallet(id: string, dto: RefundWalletDto): Promise<WalletTransactionResponseDto> {
  return unwrapApiResult<WalletTransactionResponseDto>(
    await apiClient.POST("/api/v1/wallets/{id}/refund", { params: { path: { id } }, body: dto }),
  );
}

/** See this section's own doc comment above re: the `approvalRef` placeholder — never read server-side for `.../request`. */
export async function requestAdjust(id: string, dto: AdjustWalletDto): Promise<WalletApprovalRequestResponseDto> {
  return unwrapApiResult<WalletApprovalRequestResponseDto>(
    await apiClient.POST("/api/v1/wallets/{id}/adjust/request", { params: { path: { id } }, body: dto }),
  );
}

export async function adjustWallet(id: string, dto: AdjustWalletDto): Promise<WalletTransactionResponseDto> {
  return unwrapApiResult<WalletTransactionResponseDto>(
    await apiClient.POST("/api/v1/wallets/{id}/adjust", { params: { path: { id } }, body: dto }),
  );
}

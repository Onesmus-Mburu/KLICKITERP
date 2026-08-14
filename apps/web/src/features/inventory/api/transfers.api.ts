import type { IssueTransferDto, TransferLineResponseDto, TransferResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 19 Part 2 (Stock Movements + Transfers, Module 13) — thin
 * wrapper over `TransfersController`
 * (`packages/server/src/domains/inventory/api/transfers.controller.ts`, base
 * `/api/v1/inventory/transfers`) — **all GET/cancel routes reuse
 * `inventory:transfer:issue`**; only `receive()` has its own separate
 * `inventory:transfer:receive` permission (confirmed by reading the
 * controller directly, 107 lines, every route's own `@RequirePermission`
 * decorator checked individually).
 *
 * `IssueTransferDto`/`IssueTransferLineDto`/`TransferResponseDto`/
 * `TransferLineResponseDto` (`packages/contracts/src/domains/inventory/transfer.schema.ts`)
 * have NO class-name collision anywhere else in `packages/server/src`
 * (grep-confirmed) and are flatly exported from `@klickit/contracts`'s root
 * barrel. Checked every field of `IssueTransferDto`/`IssueTransferLineDto`
 * directly against `packages/contracts/src/generated/openapi-types.ts` AND
 * the real class-validator source (`transfer.dto.ts`) — **zero request-body
 * codegen gaps found**: every field (`fromStoreId`/`toStoreId`/`lines[].
 * {itemId,qty,unitCost}`) is required on both DTOs with no optional/nullable
 * fields anywhere, so there's nothing for the usual
 * nullable-field-without-an-explicit-union reflection gap to bite —
 * `issueTransfer()` below passes its `dto` straight through with no cast,
 * matching `stores.api.ts`'s own "zero gaps" precedent.
 *
 * `TransferResponseDto.receivedBy` DOES show the familiar
 * `Record<string, never> | null` degradation in the generated shape (the
 * real class field is `receivedBy!: string | null;`, no explicit
 * `nullable: true` + `type: String` pairing — the same `taxTreatment`/
 * `parentId` reflection gap `accounts.api.ts`/`categories.api.ts` already
 * document) — but this is a RESPONSE-side field only. `unwrapApiResult<T>`'s
 * own `data` parameter is typed `unknown` (see its own doc comment), so the
 * generated (gapped) response shape is never actually checked against the
 * real `TransferResponseDto` type at any of this file's call sites — no cast
 * needed on the response side, ever, for any field, regardless of how badly
 * that field's generated shape has degraded (this is a general property of
 * `unwrapApiResult()`'s own design, not specific to this file).
 *
 * The list query-param gap is the now-familiar class:
 * `TransfersController_list`'s generated `status`/`fromStoreId`/`toStoreId`
 * query params are all required (non-optional) strings, even though the real
 * controller (`@Query("status") status?: InvTransferStatus`, etc.) treats
 * every one of them as genuinely optional. `listTransfers()` below builds the
 * query object CONDITIONALLY, matching every other `*.api.ts` file's own
 * established fix.
 *
 * **No `DRAFT` status exists anywhere in this lifecycle** — `issue()` creates
 * the header directly at `status: 'ISSUED'` and immediately records
 * `TRANSFER_OUT` at the source store inside the SAME transaction (confirmed
 * by reading `TransfersService.issue()` directly) — stock genuinely leaves
 * the source store the instant this POST returns, not at some later "submit"
 * step. `IN_TRANSIT` is a real enum value or `InvTransferStatus`
 * (`inv-transfer.entity.ts`) but no code path in this controller/service ever
 * actually SETS a transfer to `IN_TRANSIT` (confirmed by reading
 * `TransfersService.issue()`/`receive()`/`cancel()` directly — `issue()`
 * always lands on `ISSUED`, never `IN_TRANSIT`) — `receive()`/`cancel()`'s own
 * `["ISSUED", "IN_TRANSIT"].includes(...)` guards accept it defensively for a
 * future caller, but this frontend never needs to render it as a reachable
 * state today; `transfer-status-actions.tsx` still treats it identically to
 * `ISSUED` (both show Receive/Cancel) for that same forward-compatibility
 * reason, not because it's been observed live.
 */
interface TransfersListQueryShape {
  status?: string;
  fromStoreId?: string;
  toStoreId?: string;
}

export interface ListTransfersParams {
  status?: string;
  fromStoreId?: string;
  toStoreId?: string;
}

/** Creates the header + lines atomically and immediately records `TRANSFER_OUT` per line at `fromStoreId` — see this file's own doc comment on why there is no DRAFT state. `fromStoreId !== toStoreId` and a non-empty `lines` array are both re-validated server-side (`TransfersService.issue()`) even though the caller (`<TransferForm>`) also checks both client-side first. */
export async function issueTransfer(dto: IssueTransferDto): Promise<TransferResponseDto> {
  return unwrapApiResult<TransferResponseDto>(await apiClient.POST("/api/v1/inventory/transfers/issue", { body: dto }));
}

/** `ISSUED`/`IN_TRANSIT` -> `RECEIVED`; records `TRANSFER_IN` per line at `toStoreId`, valued at each line's own `unitCost` captured at issue time. `inventory:transfer:receive`-gated — the one route on this controller with its own distinct permission. */
export async function receiveTransfer(id: string): Promise<TransferResponseDto> {
  return unwrapApiResult<TransferResponseDto>(
    await apiClient.POST("/api/v1/inventory/transfers/{id}/receive", { params: { path: { id } } }),
  );
}

/** Only from `ISSUED`/`IN_TRANSIT` — reverses the source-side deduction as an `ADJUSTMENT` gain (no dedicated "transfer cancellation" movement type exists in the 7-value enum, a documented `TransfersService.cancel()` judgement call). */
export async function cancelTransfer(id: string): Promise<TransferResponseDto> {
  return unwrapApiResult<TransferResponseDto>(
    await apiClient.POST("/api/v1/inventory/transfers/{id}/cancel", { params: { path: { id } } }),
  );
}

export async function listTransfers(params: ListTransfersParams = {}): Promise<TransferResponseDto[]> {
  const query: TransfersListQueryShape = {};
  if (params.status !== undefined) query.status = params.status;
  if (params.fromStoreId !== undefined) query.fromStoreId = params.fromStoreId;
  if (params.toStoreId !== undefined) query.toStoreId = params.toStoreId;
  return unwrapApiResult<TransferResponseDto[]>(
    await apiClient.GET("/api/v1/inventory/transfers", { params: { query: query as unknown as Required<TransfersListQueryShape> } }),
  );
}

export async function getTransfer(id: string): Promise<TransferResponseDto> {
  return unwrapApiResult<TransferResponseDto>(await apiClient.GET("/api/v1/inventory/transfers/{id}", { params: { path: { id } } }));
}

export async function listTransferLines(id: string): Promise<TransferLineResponseDto[]> {
  return unwrapApiResult<TransferLineResponseDto[]>(
    await apiClient.GET("/api/v1/inventory/transfers/{id}/lines", { params: { path: { id } } }),
  );
}

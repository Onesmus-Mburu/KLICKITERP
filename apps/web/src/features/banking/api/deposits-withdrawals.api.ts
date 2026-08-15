import type { CreateDepositOrWithdrawalDto, DepositOrWithdrawalResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 21 Part 2 (Banking, Module 16) — ONE shared wrapper over BOTH
 * `DepositsController` (`packages/server/src/domains/banking/api/deposits.controller.ts`,
 * base `/api/v1/banking/deposits`, tag `banking-deposits`) and
 * `WithdrawalsController` (`.../withdrawals.controller.ts`, base
 * `/api/v1/banking/withdrawals`, tag `banking-withdrawals`) — confirmed by
 * reading both directly: they're byte-for-byte identical in route shape
 * (create/list/findOne/submit/approve/reject/post/acknowledge-sender/
 * acknowledge-receiver, 9 routes each) and share ONE request/response DTO
 * pair (`CreateDepositOrWithdrawalDto`/`DepositOrWithdrawalResponseDto`,
 * `deposit-withdrawal.dto.ts`'s own doc comment: "Shared shape for
 * bank_deposit/bank_withdrawal — the DDL's own mirror-image tables"). Every
 * exported function here takes a `kind: DepositWithdrawalKind` discriminator
 * as its first argument and branches to the correct literal path — this
 * avoids maintaining two near-identical files (and the drift risk that
 * brings) while keeping every `apiClient.GET`/`.POST` call fully typed
 * against its own real path literal (a generic templated-path helper was
 * considered and rejected: TypeScript overload resolution does NOT
 * distribute across a union-typed runtime parameter, so a helper built that
 * way would silently degrade to `string` and lose `openapi-fetch`'s own path
 * typing — the explicit per-branch calls below stay fully type-checked
 * instead).
 *
 * Permissions differ only in their `deposit`/`withdrawal` segment
 * (`banking:deposit:create` vs `banking:withdrawal:create` on
 * create/list/findOne/submit, `:decide` on approve/reject, `:post` on both
 * post AND both acknowledge routes — confirmed by reading both controllers
 * directly, the acknowledge routes reuse `:post` rather than getting their
 * own permission).
 *
 * **`CreateDepositOrWithdrawalDto` generates with no BLOCKING gap** — checked
 * directly against `openapi-types.ts`: `slipRef`/`sourceSessionId` generate as
 * `string | null` (optional, nullable) even though `deposit-withdrawal.dto.ts`'s
 * own CREATE dto class fields are plain `slipRef?: string;`/`sourceSessionId?:
 * string;` (no union) — MORE permissive than the zod-inferred type this file
 * actually binds (`slipRef?: string`, no `null`), not less, so a zod-inferred
 * `CreateDepositOrWithdrawalDto` object is still structurally assignable to
 * what `apiClient.POST`'s generated type expects; no cast needed.
 *
 * **Response side has the SAME "raw type degrades, zod-inferred type
 * doesn't" story `transfers.api.ts` (this part) and `accounts.api.ts` (Part
 * 1) already tell** — `DepositOrWithdrawalResponseDto`'s zod-inferred type
 * (`packages/contracts/src/domains/banking/deposit-withdrawal.schema.ts`)
 * already types `slipRef`/`sourceSessionId`/`approvalRef`/`journalId`/
 * `ackBySender`/`ackByReceiver` correctly as `string | null`; only the RAW
 * generated schema degrades them to `Record<string, never> | null`, and
 * that's never the bound type here.
 *
 * **One REAL, confirmed gap: `ackBySenderAt`/`ackByReceiverAt`** — the SAME
 * `Date`-vs-string codegen gap `features/payments/types.ts`'s own
 * `CashierSession`/`Cheque`/`SuspenseItem` overrides already document:
 * `deposit-withdrawal.schema.ts` declares `ackBySenderAt: z.coerce.date().nullable()`
 * / `ackByReceiverAt: z.coerce.date().nullable()`, mirroring
 * `BankDepositEntity`/`BankWithdrawalEntity`'s own `Date | null`-typed
 * columns 1:1 — but `unwrapApiResult()` (`lib/api-error.ts`) never calls
 * `.parse()` on the zod schema, it's a plain `result.data as T` cast on the
 * raw `fetch` JSON, and Nest actually serializes a `Date`-typed response
 * field as a plain ISO string over the wire. So the REAL runtime value of
 * `.ackBySenderAt`/`.ackByReceiverAt` is a STRING (or `null`), even though
 * `z.infer<...>` types it `Date`. `DepositWithdrawal` below overrides just
 * those two fields to `string | null` to match the REAL wire shape — every
 * function/component in this feature imports THIS type, never
 * `DepositOrWithdrawalResponseDto` directly, and would do `new Date(...)` at
 * any call site that genuinely needs a real `Date` object (none currently
 * do — `deposit-withdrawal-status-actions.tsx` only ever passes these two
 * fields straight to `<FormattedDateTime>`/a plain string display, never a
 * bare `.` method call on the field itself).
 *
 * **One standing query-param gap, the usual class**: both
 * `DepositsController_list`/`WithdrawalsController_list`'s generated
 * query-param types require `status`/`accountId` as plain (non-optional)
 * `string`s even though both real controllers treat them as genuinely
 * optional. Fixed the same conditional-query-object way every prior
 * `*.api.ts` file in this codebase already establishes.
 *
 * **GL posting** (both 2-line journals, the exact mirror of each other,
 * confirmed by reading `DepositsService.post()`/`WithdrawalsService.post()`
 * directly): a deposit debits the destination `bank_account.gl_account_id`
 * and credits `1700 Undeposited Funds`; a withdrawal debits `1700
 * Undeposited Funds` and credits the source `bank_account.gl_account_id`.
 * This is because `bank_deposit`/`bank_withdrawal` only ever carry ONE
 * `account_id` (the bank side) — the other leg is always this one generic
 * clearing account, never a second real `bank_account` row (a cashier's
 * till/safe is never itself registered as one) — so this feature's own
 * create dialog offers a SINGLE account picker, not two.
 *
 * **Dual acknowledgment (FR-BANK-007)** — `acknowledgeBySender()`/
 * `acknowledgeByReceiver()` (`DepositsService`/`WithdrawalsService`) take NO
 * body and carry NO status-transition guard at all (confirmed by reading
 * both services directly — every other mutation on this entity checks
 * `.status` first, these two don't), so they're callable at ANY point after
 * creation, independent of the document's own DRAFT/PENDING_APPROVAL/
 * APPROVED/POSTED progression. `deposit-withdrawal-status-actions.tsx`
 * reflects this honestly: both "Acknowledge as Sender"/"Acknowledge as
 * Receiver" buttons render unconditionally, never gated by `status`.
 */
export type DepositWithdrawalKind = "deposit" | "withdrawal";

export const BANK_DEPOSIT_WITHDRAWAL_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "POSTED"] as const;
export type BankDepositWithdrawalStatus = (typeof BANK_DEPOSIT_WITHDRAWAL_STATUSES)[number];

/** See this file's own doc comment above — `ackBySenderAt`/`ackByReceiverAt` overridden to the REAL wire shape (`string | null`), not the zod-inferred `Date | null`. */
export type DepositWithdrawal = Omit<DepositOrWithdrawalResponseDto, "ackBySenderAt" | "ackByReceiverAt"> & {
  ackBySenderAt: string | null;
  ackByReceiverAt: string | null;
};

/** A deposit/withdrawal's real `number` is only allocated at `post()` time — before that, `.number` is a `DRAFT-<uuid>` placeholder (`DepositsService.create()`/`WithdrawalsService.create()`'s own default), the same shape `isDraftPlaceholderNumber()` already established in Procurement/Expenses/this part's own `transfers.api.ts`. */
export function isDraftPlaceholderNumber(number: string): boolean {
  return number.startsWith("DRAFT-");
}

interface DwListQueryShape {
  status?: string;
  accountId?: string;
}

export interface ListDepositsOrWithdrawalsFilters {
  status?: BankDepositWithdrawalStatus;
  accountId?: string;
}

export async function listDepositsOrWithdrawals(
  kind: DepositWithdrawalKind,
  filters: ListDepositsOrWithdrawalsFilters = {},
): Promise<DepositWithdrawal[]> {
  const query: DwListQueryShape = {};
  if (filters.status !== undefined) query.status = filters.status;
  if (filters.accountId !== undefined) query.accountId = filters.accountId;
  const opts = { params: { query: query as unknown as Required<DwListQueryShape> } };
  return unwrapApiResult<DepositWithdrawal[]>(
    kind === "deposit" ? await apiClient.GET("/api/v1/banking/deposits", opts) : await apiClient.GET("/api/v1/banking/withdrawals", opts),
  );
}

export async function getDepositOrWithdrawal(kind: DepositWithdrawalKind, id: string): Promise<DepositWithdrawal> {
  return unwrapApiResult<DepositWithdrawal>(
    kind === "deposit"
      ? await apiClient.GET("/api/v1/banking/deposits/{id}", { params: { path: { id } } })
      : await apiClient.GET("/api/v1/banking/withdrawals/{id}", { params: { path: { id } } }),
  );
}

export async function createDepositOrWithdrawal(kind: DepositWithdrawalKind, dto: CreateDepositOrWithdrawalDto): Promise<DepositWithdrawal> {
  return unwrapApiResult<DepositWithdrawal>(
    kind === "deposit"
      ? await apiClient.POST("/api/v1/banking/deposits", { body: dto })
      : await apiClient.POST("/api/v1/banking/withdrawals", { body: dto }),
  );
}

/** DRAFT -> PENDING_APPROVAL (`BANK_DEPOSITS`/`BANK_WITHDRAWALS` approval chains). */
export async function submitDepositOrWithdrawal(kind: DepositWithdrawalKind, id: string): Promise<DepositWithdrawal> {
  return unwrapApiResult<DepositWithdrawal>(
    kind === "deposit"
      ? await apiClient.POST("/api/v1/banking/deposits/{id}/submit", { params: { path: { id } } })
      : await apiClient.POST("/api/v1/banking/withdrawals/{id}/submit", { params: { path: { id } } }),
  );
}

/** PENDING_APPROVAL -> APPROVED. Manual stand-in for a real approval-decision dispatcher, the same interim pattern every prior part's own `approve*()` already established. */
export async function approveDepositOrWithdrawal(kind: DepositWithdrawalKind, id: string): Promise<DepositWithdrawal> {
  return unwrapApiResult<DepositWithdrawal>(
    kind === "deposit"
      ? await apiClient.POST("/api/v1/banking/deposits/{id}/approve", { params: { path: { id } } })
      : await apiClient.POST("/api/v1/banking/withdrawals/{id}/approve", { params: { path: { id } } }),
  );
}

/** PENDING_APPROVAL -> DRAFT (NOT terminal — no dedicated REJECTED status exists on this shared 4-value enum; the document can be corrected and resubmitted). */
export async function rejectDepositOrWithdrawal(kind: DepositWithdrawalKind, id: string): Promise<DepositWithdrawal> {
  return unwrapApiResult<DepositWithdrawal>(
    kind === "deposit"
      ? await apiClient.POST("/api/v1/banking/deposits/{id}/reject", { params: { path: { id } } })
      : await apiClient.POST("/api/v1/banking/withdrawals/{id}/reject", { params: { path: { id } } }),
  );
}

/** APPROVED -> POSTED. Realizes the 2-line journal — see this file's own "GL posting" doc comment above for the exact (mirrored) mechanism per kind. */
export async function postDepositOrWithdrawal(kind: DepositWithdrawalKind, id: string): Promise<DepositWithdrawal> {
  return unwrapApiResult<DepositWithdrawal>(
    kind === "deposit"
      ? await apiClient.POST("/api/v1/banking/deposits/{id}/post", { params: { path: { id } } })
      : await apiClient.POST("/api/v1/banking/withdrawals/{id}/post", { params: { path: { id } } }),
  );
}

/** FR-BANK-007 — no body, no status guard, callable at any time. See this file's own doc comment above. */
export async function acknowledgeSender(kind: DepositWithdrawalKind, id: string): Promise<DepositWithdrawal> {
  return unwrapApiResult<DepositWithdrawal>(
    kind === "deposit"
      ? await apiClient.POST("/api/v1/banking/deposits/{id}/acknowledge-sender", { params: { path: { id } } })
      : await apiClient.POST("/api/v1/banking/withdrawals/{id}/acknowledge-sender", { params: { path: { id } } }),
  );
}

/** FR-BANK-007 — no body, no status guard, callable at any time. See this file's own doc comment above. */
export async function acknowledgeReceiver(kind: DepositWithdrawalKind, id: string): Promise<DepositWithdrawal> {
  return unwrapApiResult<DepositWithdrawal>(
    kind === "deposit"
      ? await apiClient.POST("/api/v1/banking/deposits/{id}/acknowledge-receiver", { params: { path: { id } } })
      : await apiClient.POST("/api/v1/banking/withdrawals/{id}/acknowledge-receiver", { params: { path: { id } } }),
  );
}

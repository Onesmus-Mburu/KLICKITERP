import type { BankChequeLeafResponseDto, IssueChequeLeafDto, ReasonDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 21 Part 5 (Banking, Module 16 — the LAST part of this slice)
 * — thin wrapper over `ChequeLeavesController`
 * (`packages/server/src/domains/banking/api/cheque-leaves.controller.ts`,
 * base `/api/v1/banking/cheque-leaves`, tag `banking-cheque-leaves`). **TWO
 * separate permissions**, confirmed by reading the 9-route controller
 * directly: `banking:cheque-leaf:issue` gates `issueNext()` ALONE;
 * `banking:cheque-leaf:manage` gates every other route, INCLUDING both GETs
 * — a role that can issue cheques need not be trusted to browse/stop/cancel
 * them, and vice versa. None of these are ever hidden client-side (no
 * permission-list endpoint exists anywhere in this codebase, the same
 * standing limitation every prior status-action component in this project
 * already documents) — a role missing the right one still sees the
 * button/route, and gets a real 403 surfaced verbatim via `ApiError.message`.
 *
 * **`BankChequeLeafResponseDto` — a real, confirmed gap on the RAW side,
 * none on the zod-inferred side actually imported here.** Checked directly
 * against both `openapi-types.ts` and `cheque-leaf.schema.ts`: the raw
 * generated type degrades `voucherId`/`payee`/`issuedOn`/`statusReason` all
 * to `Record<string, never> | null` (each is a plain `string | null`-typed
 * class field with no explicit `type: String` in its `@ApiProperty()` call —
 * the reflection gap `lib/api-error.ts`'s own doc comment documents; `amount`
 * is the one exception, correctly `string | null`, because ITS decorator
 * does carry an explicit `type: String`). The zod-inferred
 * `BankChequeLeafResponseDtoSchema` — what this file actually imports and
 * every caller binds to — gets all 5 nullable fields right
 * (`z.string().nullable()` throughout), the same "raw degrades, zod-inferred
 * doesn't, and the zod-inferred one is what's actually imported" story
 * `BankTransferResponseDto` (Part 2) and the 3 non-`BankReconciliation` types
 * (Part 4) already told. No local mirror interface needed for this dto.
 *
 * **`IssueChequeLeafDto`/`ReasonDto`/`CreateChequeBookDto`-sibling
 * `BankChequeBookResponseDto` all generate cleanly** — see `cheque-books.api.ts`'s
 * own doc comment for the book side; `IssueChequeLeafDto` has one small
 * subtlety worth stating precisely: its `voucherId` field is declared
 * `voucherId?: string;` (optional, NOT a `string | null` union) on the DTO
 * class, decorated `@ApiPropertyOptional({ format: "uuid", nullable: true })`
 * — since the TS field type itself carries no union, reflection succeeds
 * (`design:type` is plain `String`), so the raw generated type gets
 * `voucherId?: string | null` correct despite the `nullable: true` in the
 * decorator — a genuinely different outcome from the RESPONSE dto's own
 * `voucherId` above, which DOES union `string | null` on the class field and
 * DOES degrade. `ReasonDto` (`{ reason: string }`) has no nullable/optional
 * field at all. Every request DTO on this controller passes straight through
 * with no cast below.
 *
 * **One standing query-param gap, the usual class**:
 * `ChequeLeavesController_list`'s generated query-param type requires
 * `bookId`/`status` as plain (non-optional) `string`s even though the real
 * controller (`@Query("bookId") bookId?: string, @Query("status") status?:
 * BankChequeLeafStatus`) treats both as genuinely optional. Fixed the same
 * conditional-query-object way every prior `*.api.ts` file in this codebase
 * already establishes.
 *
 * **BR-BANK-04 sequential issuance** — `issueNext()` takes NO leaf id at
 * all, only `bookId` (+ optional `voucherId`/required `payee`/`amount`); the
 * server always auto-picks the lowest-numbered `UNUSED` leaf in that book
 * (`ChequeLeavesService.issueNext()`, confirmed by reading it directly:
 * `BankChequeLeafRepository.findNextUnused()` orders by `leafNo ASC`). A book
 * with zero remaining `UNUSED` leaves rejects with a real, verbatim-surfaced
 * `ValidationException` ("No UNUSED leaves remain in cheque book …") — never
 * pre-checked client-side beyond `issue-cheque-leaf-dialog.tsx` simply not
 * knowing which leaf will result until the call actually returns.
 *
 * **7-value status enum** — `UNUSED | ISSUED | PRESENTED | CLEARED | STOPPED
 * | CANCELLED | STALE`, confirmed against `bank-cheque-leaf.entity.ts`
 * directly (`BANK_CHEQUE_LEAF_STATUSES`). `stop()`/`cancel()` both REQUIRE a
 * non-empty `reason` — enforced both client-side here (the reason dialogs'
 * own `canSubmit` guard) AND server-side (`ChequeLeavesService`'s own
 * `requireReason()`, a real `ValidationException` if bypassed, e.g. via a
 * raw API call). `flagStale()` takes no body/params at all — a manual
 * bulk-trigger, see `flag-stale-button.tsx`'s own doc comment for why (no
 * scheduler exists anywhere in this codebase, the exact same "config/detection
 * logic exists, dispatcher doesn't" gap `RecurringService.runDue()`
 * (Expenses, Slice 20 Part 4) already established this project's own
 * precedent for).
 *
 * No schema-name collision — `BankChequeLeafResponseDto`/`IssueChequeLeafDto`/
 * `ReasonDto` are all globally unique names in `openapi-types.ts`, confirmed
 * by grep before writing this file (`ReasonDto` in particular — a generic
 * enough name to be worth checking explicitly — has exactly one definition).
 */
export const BANK_CHEQUE_LEAF_STATUSES = ["UNUSED", "ISSUED", "PRESENTED", "CLEARED", "STOPPED", "CANCELLED", "STALE"] as const;
export type BankChequeLeafStatus = (typeof BANK_CHEQUE_LEAF_STATUSES)[number];

interface ChequeLeavesListQueryShape {
  bookId?: string;
  status?: string;
}

export interface ListChequeLeavesFilters {
  bookId?: string;
  status?: BankChequeLeafStatus;
}

export async function listChequeLeaves(filters: ListChequeLeavesFilters = {}): Promise<BankChequeLeafResponseDto[]> {
  const query: ChequeLeavesListQueryShape = {};
  if (filters.bookId !== undefined) query.bookId = filters.bookId;
  if (filters.status !== undefined) query.status = filters.status;
  return unwrapApiResult<BankChequeLeafResponseDto[]>(
    await apiClient.GET("/api/v1/banking/cheque-leaves", { params: { query: query as unknown as Required<ChequeLeavesListQueryShape> } }),
  );
}

export async function getChequeLeaf(id: string): Promise<BankChequeLeafResponseDto> {
  return unwrapApiResult<BankChequeLeafResponseDto>(
    await apiClient.GET("/api/v1/banking/cheque-leaves/{id}", { params: { path: { id } } }),
  );
}

/** BR-BANK-04 — see this file's own doc comment. `voucherId` links to a real, already-existing `proc_payment_voucher` (the Part 1/Part 5 retrofit's own FK) — omitted entirely when not linking to one, never sent as `null`. */
export async function issueChequeLeaf(dto: IssueChequeLeafDto): Promise<BankChequeLeafResponseDto> {
  return unwrapApiResult<BankChequeLeafResponseDto>(await apiClient.POST("/api/v1/banking/cheque-leaves/issue", { body: dto }));
}

/** ISSUED -> PRESENTED. */
export async function markChequeLeafPresented(id: string): Promise<BankChequeLeafResponseDto> {
  return unwrapApiResult<BankChequeLeafResponseDto>(
    await apiClient.POST("/api/v1/banking/cheque-leaves/{id}/mark-presented", { params: { path: { id } } }),
  );
}

/** PRESENTED -> CLEARED. */
export async function markChequeLeafCleared(id: string): Promise<BankChequeLeafResponseDto> {
  return unwrapApiResult<BankChequeLeafResponseDto>(
    await apiClient.POST("/api/v1/banking/cheque-leaves/{id}/mark-cleared", { params: { path: { id } } }),
  );
}

/** ISSUED/PRESENTED -> STOPPED. `reason` required, both client- and server-enforced — see this file's own doc comment. */
export async function stopChequeLeaf(id: string, dto: ReasonDto): Promise<BankChequeLeafResponseDto> {
  return unwrapApiResult<BankChequeLeafResponseDto>(
    await apiClient.POST("/api/v1/banking/cheque-leaves/{id}/stop", { params: { path: { id } }, body: dto }),
  );
}

/** BR-BANK-04's explicit-skip path — UNUSED/ISSUED -> CANCELLED. `reason` required, both client- and server-enforced — see this file's own doc comment. */
export async function cancelChequeLeaf(id: string, dto: ReasonDto): Promise<BankChequeLeafResponseDto> {
  return unwrapApiResult<BankChequeLeafResponseDto>(
    await apiClient.POST("/api/v1/banking/cheque-leaves/{id}/cancel", { params: { path: { id } }, body: dto }),
  );
}

/** Manual bulk trigger — no scheduler exists, see this file's own doc comment. Flips every `ISSUED` leaf issued more than 6 months ago to `STALE`, returns the real list of leaves it actually flagged (empty when nothing qualifies — a normal, expected outcome, not an error). */
export async function flagStaleChequeLeaves(): Promise<BankChequeLeafResponseDto[]> {
  return unwrapApiResult<BankChequeLeafResponseDto[]>(await apiClient.POST("/api/v1/banking/cheque-leaves/flag-stale"));
}

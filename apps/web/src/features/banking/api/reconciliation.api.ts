import type {
  AutoMatchResultDto,
  AutoMatchSuggestionDto,
  BankReconMatchResponseDto,
  CreateAdjustmentDto,
  ManualMatchDto,
  ReopenReconciliationDto,
  StartReconciliationDto,
} from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 21 Part 4 (Banking, Module 16) — thin wrapper over
 * `ReconciliationController`
 * (`packages/server/src/domains/banking/api/reconciliation.controller.ts`,
 * base `/api/v1/banking/reconciliations`, tag `banking-reconciliation`). ONE
 * shared `banking:reconciliation:manage` permission gates every route EXCEPT
 * `reopen`, which needs the separate, more-privileged
 * `banking:reconciliation:reopen` (confirmed by reading the controller
 * directly, 168 lines) — the same privilege-separation shape
 * `banking:transfer:{create,decide,post}` (Part 2) already established, just
 * with 2 tiers instead of 3.
 *
 * **All 4 request DTOs on this controller carry real class-validator
 * decorators — checked directly against `reconciliation.dto.ts`, not
 * assumed clean because Parts 1/3 each found a real
 * `ValidationPipe`-`whitelist:true`-strips-undecorated-fields bug
 * elsewhere.** `StartReconciliationDto.{accountId,periodId}`: `@IsUUID()`.
 * `ManualMatchDto.{statementLineId,journalLineId}`: `@IsUUID()`.
 * `CreateAdjustmentDto.statementLineId`: `@IsUUID()`; `.kind`: `@IsIn(["CHARGE",
 * "INTEREST"])`; `.amount`: `@Matches(DECIMAL_PATTERN)`.
 * `ReopenReconciliationDto.reason`: `@IsString()`. Every single field on
 * every request DTO this controller accepts has a real decorator — this
 * part's own search for a 3rd instance of that bug class came up empty, and
 * that absence is reported honestly rather than silently skipped.
 *
 * **Every one of the 4 request DTOs generates CLEANLY against
 * `packages/contracts/src/generated/openapi-types.ts` — zero request-body
 * gap on any of them**, confirmed directly: none of their fields carry an
 * explicit nullable union or a Swagger `default` (every field is a plain
 * required `string`/enum), so NestJS/Swagger's reflection succeeds across
 * the board — the same "generates cleanly" story `CreateBankTransferDto`
 * (Part 2) already told. No local mirror/cast interface is needed for any of
 * `startReconciliation()`/`manualMatch()`/`createAdjustment()`/
 * `reopenReconciliation()` below; each passes its DTO straight through,
 * imported directly from `@klickit/contracts` (its zod-inferred shape
 * matches the raw generated one exactly here, confirmed by reading
 * `reconciliation.schema.ts` alongside `openapi-types.ts`).
 *
 * **The RESPONSE side has a real, genuinely split-direction gap — worth
 * stating precisely, since it runs opposite ways on two different fields of
 * the SAME dto, something no prior part in this slice found**:
 * `BankReconciliationResponseDto.lockedAt`/`.lockedBy` are BOTH `T | null`
 * fields, but neither codegen path gets both right:
 *  - The RAW generated `openapi-types.ts` schema types `lockedAt` correctly
 *    as `string | null` (a plain `nullable: true` date-time, no `format:
 *    uuid` involved, so reflection succeeds — the same "Date reflects to a
 *    correct string" story `importedAt` (Part 3) already told), but degrades
 *    `lockedBy` to `Record<string, never> | null` (a `nullable: true`
 *    `format: uuid` union — the standard reflection gap `lib/api-error.ts`'s
 *    own doc comment documents for nullable-uuid-string fields).
 *  - `@klickit/contracts`'s zod-inferred `BankReconciliationResponseDto`
 *    (`reconciliation.schema.ts`) has the OPPOSITE problem: `lockedBy:
 *    z.string().nullable()` is genuinely correct, but `lockedAt:
 *    z.coerce.date().nullable()` types as `Date | null` — WRONG, since the
 *    real wire value (confirmed by reading `ReconciliationController.toView()`
 *    directly: `lockedAt: entity.lockedAt`, a plain TypeORM `Date | null`
 *    column serialized through Nest's own JSON pipeline) round-trips as an
 *    ISO STRING over the wire, never a real `Date` instance — the same
 *    `Date`-vs-`string` gap `ackBySenderAt` (Part 2) already documented, just
 *    on a different field.
 *  - `outstanding` degrades to a bare `Record<string, never>` on the raw side
 *    (`@ApiProperty({ type: Object })`, the usual bare-`Object` reflection
 *    gap) and to an untyped `z.record(z.string(), z.unknown())` on the zod
 *    side — neither carries the REAL shape (`{}` while `IN_PROGRESS`,
 *    `{unmatchedStatementLines, unreconciledJournalLines}` once locked, plus
 *    an optional `reopenHistory` once reopened — see `ReconciliationOutstanding`
 *    below), confirmed by reading `ReconciliationService.lock()`/`.reopen()`
 *    directly.
 * Since NEITHER generated type is fully correct, this file defines its own
 * local `BankReconciliation` interface below (matching
 * `ReconciliationController.toView()`'s real output byte-for-byte) instead of
 * importing either generated shape — `unwrapApiResult<T>()` never validates
 * against the raw generated type at runtime (a plain `result.data as T`
 * cast), so binding directly to the real wire shape is safe, the same
 * technique `BankStatementImport` (Part 3) already established for its own
 * response type.
 *
 * **`BankReconMatchResponseDto` and `AutoMatchResultDto`/
 * `AutoMatchSuggestionDto` have NO gap on the zod-inferred side** — confirmed
 * directly: `BankReconMatchResponseDtoSchema.{journalLineId,adjustmentJournalId}`
 * are both `z.string().nullable()` (genuinely correct — the RAW side degrades
 * both to `Record<string, never> | null` via the same nullable-uuid-string
 * gap `lockedBy` hits above, but the zod-inferred type this file actually
 * imports and every caller binds to gets it right), and
 * `AutoMatchResultDto`/`AutoMatchSuggestionDto` have zero nullable/optional
 * fields on either side (`pass1Matches`/`pass2Matches`: `number`,
 * `suggestions`: array, each suggestion's 3 fields all plain non-nullable
 * `string`) — so these 3 types are imported straight from `@klickit/contracts`
 * below with no local override, the same "zod-inferred type is what's
 * actually correct" story `BankTransferResponseDto` (Part 2) already told for
 * `approvalRef`/`journalId`.
 *
 * **One standing query-param gap, the usual class**:
 * `ReconciliationController_list`'s generated query-param type requires
 * `accountId`/`status` as plain (non-optional) `string`s even though the real
 * controller (`@Query("accountId") accountId?: string, @Query("status")
 * status?: BankReconciliationStatus`) treats both as genuinely optional.
 * Fixed the same conditional-query-object way every prior `*.api.ts` file in
 * this codebase already establishes.
 *
 * **BR-BANK's uq_bank_reconciliation_account_period — a real 409**:
 * `ReconciliationService.start()` rejects a second reconciliation for the
 * same (account, period) pair with a `ConflictException`, both as an
 * up-front existence check AND a catch-and-translate of the DB's own unique
 * constraint (confirmed by reading it directly) — surfaced verbatim via
 * `ApiError.message` by `startReconciliation()` below, never pre-validated
 * client-side (no "list every reconciliation for this account+period"
 * cheap-check endpoint exists beyond the general list route itself).
 *
 * **The 3-pass `autoMatch()` algorithm** (confirmed by reading
 * `ReconciliationService.autoMatch()` directly — see that file's own class
 * doc comment for the full mechanism): Pass 1 (exact `external_ref` ==
 * journal number, same amount) and Pass 2 (same amount, journal date within
 * ±3 days) both create REAL `bank_recon_match` rows and flip the statement
 * line to `MATCHED` server-side, inside the SAME transaction as this one
 * `POST .../auto-match` call — `pass1Matches`/`pass2Matches` on the response
 * are counts of matches ALREADY APPLIED, not pending suggestions. Pass 3
 * (amount-only) creates NOTHING — `suggestions` is a plain, ephemeral array
 * that exists only in this one response; the caller's next step to actually
 * apply any of them is a separate `manualMatch()` call.
 */
export const BANK_RECONCILIATION_STATUSES = ["IN_PROGRESS", "LOCKED", "REOPENED"] as const;
export type BankReconciliationStatus = (typeof BANK_RECONCILIATION_STATUSES)[number];

/** One entry of `outstanding.unmatchedStatementLines` — only ever populated once `lock()` has run, see this file's own doc comment. */
export interface OutstandingStatementLine {
  id: string;
  lineDate: string;
  amount: string;
  description: string | null;
}

/** One entry of `outstanding.unreconciledJournalLines` — only ever populated once `lock()` has run. */
export interface OutstandingJournalLine {
  id: string;
  journalId: string;
  amount: string;
}

/** One entry of `outstanding.reopenHistory` — appended by `reopen()`, never cleared by a subsequent lock (there is none — see this file's own doc comment on the REOPENED dead end). */
export interface ReopenHistoryEntry {
  reason: string;
  actorId: string;
  at: string;
}

/** The REAL shape of `BankReconciliationResponseDto.outstanding` — `{}` while `IN_PROGRESS`, populated by `lock()`, `reopenHistory` appended by `reopen()`. Neither generated type models this — see this file's own doc comment. */
export interface ReconciliationOutstanding {
  unmatchedStatementLines?: OutstandingStatementLine[];
  unreconciledJournalLines?: OutstandingJournalLine[];
  reopenHistory?: ReopenHistoryEntry[];
}

/** The REAL wire shape of `BankReconciliationResponseDto` — see this file's own doc comment for the split codegen gap neither `openapi-types.ts` nor `@klickit/contracts`'s zod-inferred type gets fully right on its own. */
export interface BankReconciliation {
  id: string;
  accountId: string;
  periodId: string;
  status: BankReconciliationStatus;
  bookBalance: string;
  bankBalance: string;
  outstanding: ReconciliationOutstanding;
  lockedBy: string | null;
  lockedAt: string | null;
}

export type { AutoMatchResultDto, AutoMatchSuggestionDto, BankReconMatchResponseDto };
export type { StartReconciliationDto, ManualMatchDto, CreateAdjustmentDto, ReopenReconciliationDto };

interface ReconciliationsListQueryShape {
  accountId?: string;
  status?: string;
}

export interface ListReconciliationsFilters {
  accountId?: string;
  status?: BankReconciliationStatus;
}

export async function listReconciliations(filters: ListReconciliationsFilters = {}): Promise<BankReconciliation[]> {
  const query: ReconciliationsListQueryShape = {};
  if (filters.accountId !== undefined) query.accountId = filters.accountId;
  if (filters.status !== undefined) query.status = filters.status;
  return unwrapApiResult<BankReconciliation[]>(
    await apiClient.GET("/api/v1/banking/reconciliations", {
      params: { query: query as unknown as Required<ReconciliationsListQueryShape> },
    }),
  );
}

export async function getReconciliation(id: string): Promise<BankReconciliation> {
  return unwrapApiResult<BankReconciliation>(
    await apiClient.GET("/api/v1/banking/reconciliations/{id}", { params: { path: { id } } }),
  );
}

/** The `bank_recon_match` rows created so far — real, persisted rows only (pass-3 suggestions never appear here until a `manualMatch()` call actually applies one). */
export async function getReconciliationMatches(id: string): Promise<BankReconMatchResponseDto[]> {
  return unwrapApiResult<BankReconMatchResponseDto[]>(
    await apiClient.GET("/api/v1/banking/reconciliations/{id}/matches", { params: { path: { id } } }),
  );
}

/** BR-BANK's `uq_bank_reconciliation_account_period` real 409 is surfaced verbatim via `ApiError.message` — see this file's own doc comment. */
export async function startReconciliation(dto: StartReconciliationDto): Promise<BankReconciliation> {
  return unwrapApiResult<BankReconciliation>(await apiClient.POST("/api/v1/banking/reconciliations", { body: dto }));
}

/** Runs all 3 passes server-side — see this file's own doc comment for exactly which passes create real match rows vs. return bare suggestions. Only legal while `status === "IN_PROGRESS"` (a real 422 otherwise, surfaced verbatim). */
export async function autoMatch(id: string): Promise<AutoMatchResultDto> {
  return unwrapApiResult<AutoMatchResultDto>(
    await apiClient.POST("/api/v1/banking/reconciliations/{id}/auto-match", { params: { path: { id } } }),
  );
}

/** Applies one chosen pairing (e.g. a pass-3 suggestion). BR-BANK-02's UQ backstop on `(statement_line_id)`/`(journal_line_id)` is a real 409 if either side is already matched — surfaced verbatim, no client-side pre-check (see `ReconciliationService.manualMatch()`'s own doc comment). Only legal while `status === "IN_PROGRESS"`. */
export async function manualMatch(id: string, dto: ManualMatchDto): Promise<BankReconMatchResponseDto> {
  return unwrapApiResult<BankReconMatchResponseDto>(
    await apiClient.POST("/api/v1/banking/reconciliations/{id}/manual-match", { params: { path: { id } }, body: dto }),
  );
}

/** P-33 (CHARGE) or its INTEREST mirror — a real 2-line journal posted server-side in the same call. Only legal while `status === "IN_PROGRESS"` — see this file's own doc comment on why this creates a real, documented workflow gap for statement lines that never appear in ANY auto-match pass or suggestion. */
export async function createAdjustment(id: string, dto: CreateAdjustmentDto): Promise<BankReconMatchResponseDto> {
  return unwrapApiResult<BankReconMatchResponseDto>(
    await apiClient.POST("/api/v1/banking/reconciliations/{id}/adjustments", { params: { path: { id } }, body: dto }),
  );
}

/** BR-BANK-03 — only legal from `status === "IN_PROGRESS"`. Populates `outstanding` with the real unmatched-line snapshot (the ONLY point in this whole workflow where the frontend can show a rich unmatched-lines table — see this file's own doc comment). A `LOCKED` or `REOPENED` reconciliation rejects this with a real 422 — a `REOPENED` one can NEVER be re-locked through this route (confirmed by reading `ReconciliationService.lock()` directly: it only ever checks `status !== "IN_PROGRESS"`, and no OTHER route transitions `REOPENED` back to `IN_PROGRESS`). */
export async function lockReconciliation(id: string): Promise<BankReconciliation> {
  return unwrapApiResult<BankReconciliation>(
    await apiClient.POST("/api/v1/banking/reconciliations/{id}/lock", { params: { path: { id } } }),
  );
}

/** `banking:reconciliation:reopen` — a separate, more-privileged permission from every other route on this controller. Only legal from `status === "LOCKED"`. The `reason` is never stored in a dedicated column — it's appended to `outstanding.reopenHistory[]` (see `ReconciliationOutstanding` above), a real persisted audit trail. */
export async function reopenReconciliation(id: string, dto: ReopenReconciliationDto): Promise<BankReconciliation> {
  return unwrapApiResult<BankReconciliation>(
    await apiClient.POST("/api/v1/banking/reconciliations/{id}/reopen", { params: { path: { id } }, body: dto }),
  );
}

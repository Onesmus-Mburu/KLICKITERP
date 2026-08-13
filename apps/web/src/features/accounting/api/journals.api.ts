import type { JournalResponseDto, PostJournalDto, ReverseJournalDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 17 Part 2 (Journals, Module 7) — thin wrapper over
 * `JournalsController` (`packages/server/src/accounting/api/journals.controller.ts`,
 * base `/api/v1/accounting/journals`) — `accounting:journal:post` gates
 * create/reverse, `accounting:journal:view` gates list/get (confirmed by
 * reading the controller directly, 131 lines).
 *
 * **Only ONE codegen gap here, not the "expect more" the plan warned about**
 * — checked every field of `PostJournalDto`/`JournalLineInputDto`/
 * `ReverseJournalDto` against `packages/contracts/src/generated/openapi-types.ts`
 * directly (not assumed): unlike `accounts.api.ts`'s `isControl`/
 * `CreateFiscalYearDto.periodCount`, NONE of `PostJournalDto`'s optional
 * fields (`sourceDocType`, `sourceDocId`, `periodId`) carry a Swagger
 * `default` value in `post-journal.dto.ts` (plain `@ApiPropertyOptional()` +
 * `@IsOptional()`, no `default:`) — that's the specific trigger for the
 * "generated type drops the `?`" bug (see `accounts.api.ts`'s own doc
 * comment), and it doesn't fire here. The generated `PostJournalDto`/
 * `JournalLineInputDto`/`ReverseJournalDto` REQUEST-body shapes already
 * match the real zod-inferred DTOs' optionality field-for-field (the
 * generated line fields additionally allow `| null`, which only WIDENS what
 * the real, narrower `string | undefined` values from `@klickit/contracts`
 * are assignable to) — confirmed structurally AND by a clean `tsc --noEmit`
 * passing `dto` straight through with no `as unknown as` cast anywhere on
 * these two POST bodies, a genuine difference from every other file in this
 * feature folder that's worth calling out explicitly so the next person
 * doesn't assume a cast is needed here too.
 *
 * The one real gap: `JournalsController_list`'s generated query-param type
 * requires `sourceModule`/`sourceDocType`/`sourceDocId`/`periodId`/
 * `fromDate`/`toDate` as plain (non-optional) `string`s even though the real
 * controller (`@Query("sourceModule") sourceModule?: string`, etc., all six
 * params) treats every one as genuinely optional — the exact same class of
 * gap `accounts.api.ts`'s own doc comment documents for `class`/`isActive`/
 * `parentId`. Fixed the same way: the query object is built CONDITIONALLY
 * (only keys with a real, non-empty value included), then cast at the call
 * boundary — `GlJournalRepository.list()` (confirmed by reading it) treats
 * an absent filter key as "no constraint on this column," so padding with
 * empty strings would silently turn every list call into "match nothing"
 * for whichever filters were left blank, not "no filter."
 */
interface JournalsListQueryShape {
  sourceModule?: string;
  sourceDocType?: string;
  sourceDocId?: string;
  periodId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface ListJournalsParams {
  sourceModule?: string;
  sourceDocType?: string;
  sourceDocId?: string;
  periodId?: string;
  fromDate?: string;
  toDate?: string;
}

/** `lines` is always `[]` on every journal returned here — `JournalsController.list()`'s own body forces it (`Object.assign(journal, { lines: [] })`) before serializing; only `getJournal()` (the `{id}` detail route) populates real lines. Never render a line count/amount from this endpoint's data. */
export async function listJournals(params: ListJournalsParams = {}): Promise<JournalResponseDto[]> {
  const query: JournalsListQueryShape = {};
  if (params.sourceModule) query.sourceModule = params.sourceModule;
  if (params.sourceDocType) query.sourceDocType = params.sourceDocType;
  if (params.sourceDocId) query.sourceDocId = params.sourceDocId;
  if (params.periodId) query.periodId = params.periodId;
  if (params.fromDate) query.fromDate = params.fromDate;
  if (params.toDate) query.toDate = params.toDate;
  return unwrapApiResult<JournalResponseDto[]>(
    await apiClient.GET("/api/v1/accounting/journals", { params: { query: query as unknown as Required<JournalsListQueryShape> } }),
  );
}

/** The only endpoint that returns populated `lines` — backs the journal detail page. */
export async function getJournal(id: string): Promise<JournalResponseDto> {
  return unwrapApiResult<JournalResponseDto>(await apiClient.GET("/api/v1/accounting/journals/{id}", { params: { path: { id } } }));
}

/**
 * `journalType` is always forced to `"MANUAL"` server-side — `PostJournalDto`
 * has no `journalType` field at all (confirmed against both the real DTO and
 * the generated type), so there's nothing for a caller to set here.
 * `periodId` is best left omitted by callers that don't need to override it:
 * the server resolves the current period for `journalDate` via
 * `GlPeriodRepository.findCurrentForDate()` when absent.
 */
export async function createJournal(dto: PostJournalDto): Promise<JournalResponseDto> {
  return unwrapApiResult<JournalResponseDto>(await apiClient.POST("/api/v1/accounting/journals", { body: dto }));
}

/** Creates a NEW journal (`journalType: "REVERSING"`, `reversalOfId` pointing back at `id`) with every line's debit/credit swapped — never mutates the original. No server-side guard against reversing an already-reversed journal (confirmed by reading `PostingService.reverse()` directly: it has no such check), so the caller is responsible for the "already reversed?" UX check — see `use-journals.ts`'s `useJournalReversal()` doc comment for how this file's own callers do that. */
export async function reverseJournal(id: string, narration: string): Promise<JournalResponseDto> {
  const dto: ReverseJournalDto = { narration };
  return unwrapApiResult<JournalResponseDto>(
    await apiClient.POST("/api/v1/accounting/journals/{id}/reverse", { params: { path: { id } }, body: dto }),
  );
}

import type { FileObjectResponseDto, ImportBankStatementLinesResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 21 Part 3 (Statement Import, Module 16) — thin wrapper over
 * `StatementImportController`
 * (`packages/server/src/domains/banking/api/statement-import.controller.ts`,
 * base `/api/v1/banking/statement-imports`, tag `banking-statement-import`) —
 * ONE shared `banking:statement:import` permission gates ALL 3 routes,
 * including the LIST route (confirmed by reading the controller directly, 71
 * lines — the same "no separate read-only view permission" shape
 * `accounts.api.ts` (Part 1) already established for `AccountsController`).
 *
 * **This endpoint does NOT parse files server-side at all** — confirmed by
 * reading `bank-statement-import.service.ts`/`statement-import.dto.ts`
 * directly: `ImportBankStatementLinesDto.rawRows` is already-flat,
 * already-parsed `Array<Record<string, unknown>>` input, and `fileId` is a
 * reference to an ALREADY-UPLOADED `file_object` row (never re-read by this
 * endpoint — it's stored purely as an audit/reference pointer on the
 * `bank_statement_import` row). This module therefore also owns the one
 * small multipart upload this feature needs (`uploadStatementFile()` below)
 * — a SEPARATE, minimal copy of `features/branding/api/files.api.ts`'s own
 * `uploadFile()`, not a cross-feature import: no feature folder in this
 * codebase imports another feature's `api/`/`hooks/` files (confirmed by
 * grepping for cross-feature imports before writing this — every feature
 * that needs file upload owns its own copy), so this file follows that same
 * per-feature-boundary discipline rather than being the first to break it.
 *
 * **Real codegen gaps, confirmed directly against `openapi-types.ts` and
 * `packages/contracts/src/domains/banking/statement-import.schema.ts` — a
 * GENUINELY DIFFERENT shape from every prior gap this module found**, worth
 * stating precisely since it runs the OPPOSITE direction from the usual
 * "raw type degrades, zod-inferred type doesn't" story every sibling
 * `*.api.ts` file in this module documents:
 *
 * 1. **`ImportBankStatementLinesDto.rawRows`** degrades to
 *    `Record<string, never>[]` in the RAW generated `openapi-types.ts` (the
 *    class field is `rawRows!: Array<Record<string, unknown>>;` with
 *    `@ApiProperty({ type: [Object] })` — a bare `Object` array type, the
 *    same reflection gap `lib/api-error.ts`'s own doc comment documents for
 *    bare-object fields generally). Fixed with a local
 *    `ImportStatementLinesRequestBody` mirroring the GENERATED (gapped)
 *    shape, cast at the `apiClient.POST` boundary — the same pattern
 *    `accounts.api.ts`'s own `UpdateBankAccountRequestBody` already
 *    establishes.
 * 2. **`mappingTemplate` has NO gap on the RAW side** — `ImportBankStatementLinesDto.mappingTemplate`
 *    in `openapi-types.ts` correctly types through to
 *    `BankStatementMappingTemplateDto` (`{columnMap: BankStatementColumnMapDto,
 *    dateFormat: string, debitCreditConvention: "SEPARATE_COLUMNS"|"SIGNED_AMOUNT"}`,
 *    itself correctly typed with `columnMap: {date: string, description: string,
 *    debit?: string, credit?: string, amount?: string, ref?: string}`) — because
 *    the DTO class field is `@ApiProperty({ type: BankStatementMappingTemplateDto })`,
 *    a real nested CLASS reference, not a bare `Object`, so NestJS/Swagger's
 *    reflection succeeds. **The OPPOSITE is true of `@klickit/contracts`'
 *    own zod-inferred type** — `ImportBankStatementLinesDtoSchema.mappingTemplate`
 *    is generated as `z.record(z.string(), z.unknown())`, a flat untyped
 *    record, NOT a reference to `BankStatementMappingTemplateDtoSchema`
 *    (confirmed by reading `statement-import.schema.ts` directly — the zod
 *    codegen script evidently didn't follow the nested-DTO reference the way
 *    NestJS/Swagger's OWN reflection did). This is why this file defines its
 *    own local `StatementMappingTemplate`/`StatementColumnMap` types below
 *    instead of importing `@klickit/contracts`' zod-inferred
 *    `ImportBankStatementLinesDto` — that type's own `mappingTemplate: Record<string,
 *    unknown>` would give every caller (`column-mapping-form.tsx` especially)
 *    zero autocomplete/type-safety on `columnMap.date`/`.dateFormat`/etc.,
 *    even though the REAL, correctly-typed shape already exists one level
 *    down in the raw generated schema. `rawRows`, by contrast, has the STORY
 *    REVERSED: the zod-inferred `z.array(z.record(z.string(), z.unknown()))`
 *    is ALREADY the correct `Array<Record<string, unknown>>` shape — only the
 *    raw side needs the cast (gap #1 above).
 * 3. **`BankStatementImportResponseDto.mappingTemplate`** degrades the same
 *    way as gap #1 on the RESPONSE side (`mappingTemplate!: Record<string,
 *    unknown>;` with `@ApiProperty({ type: Object })` — again a bare `Object`,
 *    not a class reference, so it degrades to `Record<string, never>` in the
 *    raw generated type). Not a blocking gap here — `unwrapApiResult<T>()`
 *    never validates against the raw generated type at runtime (`lib/api-error.ts`'s
 *    own `result.data as T` cast, see that file's own doc comment), so this
 *    file's own local `BankStatementImport` response type (below) just
 *    types `mappingTemplate: StatementMappingTemplate` directly — the REAL
 *    wire shape, confirmed by reading `StatementImportController.toView()`
 *    directly (`mappingTemplate: entity.mappingTemplate`, stored verbatim as
 *    JSONB, round-trips byte-for-byte).
 * 4. **`importedAt`** — `BankStatementImportResponseDto.importedAt` is typed
 *    `Date` in the class (`@ApiProperty({ type: Date }) importedAt!: Date;`)
 *    but reflects CORRECTLY to `string` (format date-time) in the raw
 *    generated type (unlike the `ackBySenderAt`/`.ackByReceiverAt` gap
 *    `deposits-withdrawals.api.ts` (Part 2) documents, where the raw type ALSO
 *    got it right but the zod-inferred `Date` type didn't — here it's simpler:
 *    both sides already agree it's a string over the wire). This file's own
 *    local `BankStatementImport.importedAt: string` matches that directly, no
 *    override needed.
 * 5. **One standing query-param gap, the usual class**:
 *    `StatementImportController_list`'s generated query-param type requires
 *    `accountId` as a plain (non-optional) `string`, even though the real
 *    controller (`@Query("accountId") accountId?: string`) treats it as
 *    genuinely optional. Fixed the same conditional-query-object way every
 *    prior `*.api.ts` file in this codebase already establishes.
 *
 * **BR-BANK-02 dedupe** — `importLines()` computes a SHA-256
 * `dedupe_hash = accountId|lineDate|signedAmount|ref` per row BEFORE writing
 * anything, and skips (not rejects) any row whose hash already exists for
 * this account (`BankStatementImportService.importLines()`, confirmed by
 * reading it directly) — `duplicateCount` on the response is a REAL count of
 * skipped rows, never an error condition. A re-import of the exact same
 * `rawRows` for the same account therefore always returns `insertedCount: 0,
 * duplicateCount: rawRows.length` with a real `201`, not a 409/422 — see
 * `import-result-summary.tsx`'s own doc comment for how this is surfaced
 * honestly, not as a warning.
 */

// ---- statement-import types (local — see this file's own doc comment gap #2 above) ----

export type DebitCreditConvention = "SEPARATE_COLUMNS" | "SIGNED_AMOUNT";

/** Mirrors `BankStatementColumnMapDto` — this one HAS no codegen gap on either side, see this file's own doc comment. */
export interface StatementColumnMap {
  date: string;
  description: string;
  debit?: string;
  credit?: string;
  amount?: string;
  ref?: string;
}

/** Mirrors `BankStatementMappingTemplateDto` byte-for-byte. */
export interface StatementMappingTemplate {
  columnMap: StatementColumnMap;
  dateFormat: string;
  debitCreditConvention: DebitCreditConvention;
}

export interface ImportStatementLinesInput {
  accountId: string;
  fileId: string;
  mappingTemplate: StatementMappingTemplate;
  /** Flat rows already parsed client-side — see `lib/csv-parser.ts`'s own doc comment. */
  rawRows: Array<Record<string, unknown>>;
}

/** The REAL wire shape of `BankStatementImportResponseDto` — see this file's own doc comment gaps #3/#4 above. */
export interface BankStatementImport {
  id: string;
  accountId: string;
  fileId: string;
  mappingTemplate: StatementMappingTemplate;
  importedAt: string;
  lineCount: number;
  duplicateCount: number;
}

/** Mirrors `ImportBankStatementLinesDto`'s GENERATED (gapped) shape — only `rawRows` needs it, see this file's own doc comment gap #1 above. */
interface ImportStatementLinesRequestBody {
  accountId: string;
  fileId: string;
  mappingTemplate: StatementMappingTemplate;
  rawRows: Record<string, never>[];
}

interface StatementImportsListQueryShape {
  accountId?: string;
}

export async function listStatementImports(accountId?: string): Promise<BankStatementImport[]> {
  const query: StatementImportsListQueryShape = {};
  if (accountId !== undefined) query.accountId = accountId;
  return unwrapApiResult<BankStatementImport[]>(
    await apiClient.GET("/api/v1/banking/statement-imports", {
      params: { query: query as unknown as Required<StatementImportsListQueryShape> },
    }),
  );
}

export async function getStatementImport(id: string): Promise<BankStatementImport> {
  return unwrapApiResult<BankStatementImport>(
    await apiClient.GET("/api/v1/banking/statement-imports/{id}", { params: { path: { id } } }),
  );
}

/** BR-BANK-02's real dedupe-on-reimport — see this file's own doc comment above. `insertedCount + duplicateCount === rawRows.length` always (every row is either newly inserted or a confirmed duplicate, never silently dropped for any other reason — `parseRow()`'s own malformed-row cases throw a real 422 instead, surfaced verbatim via `ApiError.message`). */
export async function importStatement(dto: ImportStatementLinesInput): Promise<ImportBankStatementLinesResponseDto> {
  return unwrapApiResult<ImportBankStatementLinesResponseDto>(
    await apiClient.POST("/api/v1/banking/statement-imports", {
      body: dto as unknown as ImportStatementLinesRequestBody,
    }),
  );
}

// ---- generic file upload (this feature's own minimal copy — see this file's own doc comment above) ----

/** `file_object.entity_type` this upload is tagged with — free-text server-side (`UploadFileFieldsDto.entityType`), purely descriptive metadata, matching `features/branding/constants.ts`'s own `FILE_ENTITY_TYPE` precedent. */
export const STATEMENT_FILE_ENTITY_TYPE = "BANK_STATEMENT_IMPORT";

/**
 * First real multipart upload in THIS feature folder — see
 * `features/branding/api/files.api.ts`'s own doc comment for the underlying
 * `openapi-fetch` `FormData`-passthrough mechanism this mirrors exactly (a
 * `FormData` instance is passed straight through by `openapi-fetch`'s
 * `defaultBodySerializer`, Content-Type deliberately left unset so the
 * browser fills in the multipart boundary itself). The generated
 * request-body type for `POST /api/v1/files` is a plain `{file, entityType,
 * entityId}` object shape (multipart bodies aren't class-validator-reflectable
 * beyond that) and doesn't structurally match a real `FormData` instance — the
 * same `as unknown as X` codegen-gap-cast convention every `*.api.ts` file in
 * this codebase already establishes, applied at this one call boundary.
 */
interface UploadFileRequestBody {
  file: string;
  entityType?: string;
}

export async function uploadStatementFile(file: File): Promise<FileObjectResponseDto> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("entityType", STATEMENT_FILE_ENTITY_TYPE);
  return unwrapApiResult<FileObjectResponseDto>(
    await apiClient.POST("/api/v1/files", { body: formData as unknown as UploadFileRequestBody }),
  );
}

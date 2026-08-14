import type { CreateRecurringDto, RecurringResponseDto, RunDueDto, RunDueResultDto, UpdateRecurringDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import { VOUCHER_METHODS, VOUCHER_PAYEE_TYPES, type VoucherMethod, type VoucherPayeeType } from "./vouchers.api";

/**
 * Phase 6 Slice 20 Part 4 (Recurring Templates, Module 14 — the LAST part of
 * this slice) — thin wrapper over `RecurringController`
 * (`packages/server/src/domains/expenses/api/recurring.controller.ts`, base
 * `/api/v1/expenses/recurring`, tag `expenses-recurring`) — `expenses:recurring:manage`
 * gates create/list/get/update (confirmed by reading the controller directly,
 * 88 lines — one bundled permission reused across every GET too, the
 * identical "no separate view permission" shape `vouchers.api.ts`/`claims.api.ts`
 * already established for their own controllers), `expenses:recurring:run`
 * is a SEPARATE, dedicated permission gating ONLY `runDue()`.
 *
 * **There is NO backend scheduler/cron/worker process anywhere in this
 * codebase that ever calls `run-due` automatically** — confirmed by reading
 * `RecurringService`'s own class doc comment directly ("A real deployment
 * would need an external cron/systemd-timer/CI-scheduled-job hitting `POST
 * /expenses/recurring/run-due`"), the same documented "detection logic
 * exists, dispatcher doesn't" gap `WalletTransactionsService.reconcile()`/
 * `comm_trigger_binding` already established elsewhere in this codebase.
 * `runDueTemplates()` below is therefore the ONLY code path in this whole
 * frontend that can ever materialize a due template into a real voucher —
 * `<RunDueButton>` (this part's own component) is deliberately a prominent,
 * top-of-page action on the list route, never buried, because without a user
 * actually clicking it, this entire feature is inert.
 *
 * **`template` is reused EXACTLY from Part 1's own `CreateVoucherDto` shape**
 * (`payeeType`/`payeeRef`/`categoryId`/`costCenterId`/`amount`/`method`/`narrative`
 * — everything a real `exp_voucher` needs minus the fields only assignable at
 * materialization time: `number`/`status`/`approvalRef`/`journalId`, confirmed
 * by reading `RecurringVoucherTemplate`'s own doc comment in
 * `recurring.service.ts` directly) — `VOUCHER_METHODS`/`VOUCHER_PAYEE_TYPES`
 * are reused here rather than duplicated, the same in-module,
 * same-sibling-sub-domain reuse `claims.api.ts` (Part 3) already established
 * for its own `CLAIM_METHODS = VOUCHER_METHODS`.
 *
 * **`template` is a full-overwrite jsonb column on `PATCH`, never a deep
 * merge** — confirmed by reading `RecurringService.update()` directly:
 * `if (changes.template !== undefined) { ...; row.template = changes.template }`
 * replaces the WHOLE object. `<EditRecurringDialog>` must always send the
 * complete template (every one of its 7 fields) whenever ANY one of them
 * changes — never a partial `{narrative: "..."}`-shaped patch, which would
 * silently wipe every other template field on the server. `parseRecurringTemplate()`
 * below exists specifically to make round-tripping the opaque
 * `Record<string, unknown>` response back into a complete, typed, editable
 * form reliable (reused by both `<EditRecurringDialog>`'s own pre-fill and
 * the list page's payee-resolution column) — the same runtime
 * `typeof`-guarded parsing `vouchers/[id]/page.tsx`'s own `payeeLabel`
 * computation already establishes for the identical `payeeRef` polymorphism.
 *
 * **Two real request-body gaps on `RecurringTemplateDto`, both confirmed
 * directly against the GENERATED type** (`packages/contracts/src/generated/openapi-types.ts`,
 * not assumed from Part 1's own `CreateVoucherDto`/`UpdateVoucherDto`
 * precedent, per this part's own brief's standing "confirm live, never
 * assume from a prior part" discipline):
 * 1. `RecurringTemplateDto.payeeRef` degrades to `Record<string, never>` (not
 *    `Record<string, unknown>`) — `recurring.dto.ts`'s own
 *    `@ApiProperty({ type: Object })` decorator gives Swagger no structural
 *    shape to reflect for a genuinely polymorphic field, the identical gap
 *    Part 1's own `CreateVoucherDto.payeeRef` documents.
 * 2. `RecurringTemplateDto.costCenterId` degrades to `Record<string, never> |
 *    null` (not `string | null`) — `recurring.dto.ts`'s own
 *    `costCenterId?: string | null` field carries an explicit union type,
 *    defeating NestJS/Swagger's reflection, the identical
 *    explicit-union-defeats-reflection gap `UpdateVoucherDto.costCenterId`/
 *    `UpdateCategoryDto.parentId` already document. Notably this gap applies
 *    to `RecurringTemplateDto` itself (used inside BOTH `CreateRecurringDto`
 *    and `UpdateRecurringDto`), unlike Part 1 where the create-side
 *    `CreateVoucherDto.costCenterId` had no gap and only the update-side did
 *    — here there is only ONE template shape, shared by create and update,
 *    so both directions carry the gap identically.
 *
 * Fixed the same established way: a local `RecurringTemplateRequestBody`
 * mirrors the GENERATED (gapped) shape, embedded in
 * `CreateRecurringRequestBody`/`UpdateRecurringRequestBody`, cast at the
 * `apiClient.POST`/`.PATCH` boundary only.
 *
 * **`RecurringResponseDto.lastVoucherId` degrades to `Record<string, never> |
 * null`** (a plain `nullable: true` `@ApiProperty` with no explicit
 * `type: String`, the same response-side class of gap `lib/api-error.ts`
 * documents generally) — needs no fix, `unwrapApiResult<T>()`'s `data:
 * unknown` parameter absorbs it, and the REAL, correctly-typed
 * `RecurringResponseDto` (zod-inferred, `lastVoucherId: string | null`) is
 * what every caller of this file actually gets back.
 *
 * **`RunDueDto`/`RunDueResultDto` both generate CLEANLY, zero gap** —
 * confirmed directly: `RunDueDto.asOfDate` is a plain optional `string` with
 * no union annotation, and every `RunDueResultDto` field is a plain required
 * `string`. `runDueTemplates()` passes its body straight through with no
 * `as unknown as` cast.
 *
 * **No query params anywhere on this controller** (confirmed directly
 * against the generated `paths["/api/v1/expenses/recurring/**"]` entries —
 * `list()` takes no params at all, `findOne()`/`update()` take only a path
 * `id`, `runDue()` takes only a body) — this file also skips the standing
 * conditional-query-object workaround every other `*.api.ts` file needs for
 * at least one endpoint (the same genuine absence Part 2's own
 * `petty-cash.api.ts` documents for its own 11 routes).
 *
 * **No schema-name collision** — `RecurringTemplateDto`/`CreateRecurringDto`/
 * `UpdateRecurringDto`/`RecurringResponseDto`/`RunDueDto`/`RunDueResultDto`
 * are all globally unique names (confirmed by grepping `openapi-types.ts`),
 * unlike Part 1's own Categories collision with Inventory.
 */

/** Mirrors `RecurringTemplateDto`'s GENERATED (gapped) shape — see this file's own doc comment above. Shared by both create and update (`RecurringTemplateDto` backs both `CreateRecurringDto.template` and `UpdateRecurringDto.template`). */
interface RecurringTemplateRequestBody {
  payeeType: VoucherPayeeType;
  payeeRef: Record<string, never>;
  categoryId: string;
  costCenterId?: Record<string, never> | null;
  amount: string;
  method: VoucherMethod;
  narrative: string;
}

/** Mirrors `CreateRecurringDto`'s GENERATED (gapped) shape — see this file's own doc comment above. */
interface CreateRecurringRequestBody {
  template: RecurringTemplateRequestBody;
  scheduleCron: string;
  nextRunOn: string;
}

/** Mirrors `UpdateRecurringDto`'s GENERATED (gapped) shape — see this file's own doc comment above. */
interface UpdateRecurringRequestBody {
  template?: RecurringTemplateRequestBody;
  scheduleCron?: string;
  nextRunOn?: string;
  isActive?: boolean;
}

export async function listRecurringTemplates(): Promise<RecurringResponseDto[]> {
  return unwrapApiResult<RecurringResponseDto[]>(await apiClient.GET("/api/v1/expenses/recurring"));
}

export async function getRecurringTemplate(id: string): Promise<RecurringResponseDto> {
  return unwrapApiResult<RecurringResponseDto>(await apiClient.GET("/api/v1/expenses/recurring/{id}", { params: { path: { id } } }));
}

/** Creates a template with `isActive: true` (server-hardcoded — `CreateRecurringDto` itself has no `isActive` field, confirmed by reading `RecurringService.create()` directly). */
export async function createRecurringTemplate(dto: CreateRecurringDto): Promise<RecurringResponseDto> {
  return unwrapApiResult<RecurringResponseDto>(
    await apiClient.POST("/api/v1/expenses/recurring", { body: dto as unknown as CreateRecurringRequestBody }),
  );
}

/** Every field optional, incl. `isActive`. **`template`, if present at all, must be the COMPLETE 7-field object** — see this file's own doc comment on the full-overwrite (not deep-merge) semantics. */
export async function updateRecurringTemplate(id: string, dto: UpdateRecurringDto): Promise<RecurringResponseDto> {
  return unwrapApiResult<RecurringResponseDto>(
    await apiClient.PATCH("/api/v1/expenses/recurring/{id}", {
      params: { path: { id } },
      body: dto as unknown as UpdateRecurringRequestBody,
    }),
  );
}

/**
 * **THE manual trigger — see this file's own doc comment above.** Materializes
 * a plain DRAFT `exp_voucher` (never submitted/approved/paid) for every
 * ACTIVE template whose `nextRunOn <= asOfDate`, then advances that
 * template's own `nextRunOn` per its `scheduleCron` and sets `lastVoucherId`.
 * `asOfDate` defaults to today (server UTC date) when omitted. Returns one
 * `RunDueResultDto` per template that actually fired — an empty array is a
 * real, valid "nothing was due" outcome, not an error.
 */
export async function runDueTemplates(dto: RunDueDto = {}): Promise<RunDueResultDto[]> {
  return unwrapApiResult<RunDueResultDto[]>(await apiClient.POST("/api/v1/expenses/recurring/run-due", { body: dto }));
}

/** A template's `template` jsonb payload, safely parsed into typed fields for form/display use — see this file's own doc comment above. */
export interface ParsedRecurringTemplate {
  payeeType: VoucherPayeeType;
  supplierId: string;
  staffUserId: string;
  otherName: string;
  otherContact: string;
  categoryId: string;
  costCenterId: string;
  amount: string;
  method: VoucherMethod;
  narrative: string;
}

/**
 * `template` is a genuinely untyped `Record<string, unknown>` on the wire
 * (opaque jsonb, per `ExpRecurringEntity`'s own doc comment) — every field
 * read here is guarded with a runtime `typeof`/membership check, never
 * trusted blindly, the same discipline `vouchers/[id]/page.tsx`'s own
 * `payeeLabel` computation already establishes for `payeeRef`.
 * `costCenterId`/`supplierId`/`staffUserId`/`otherName`/`otherContact` all
 * fall back to `""` (never present, or a genuinely absent optional field) —
 * callers treat `""` as "not set", matching every other Combobox/Input's own
 * empty-string-means-unset convention elsewhere in this codebase.
 */
export function parseRecurringTemplate(template: Record<string, unknown>): ParsedRecurringTemplate {
  const payeeType: VoucherPayeeType = VOUCHER_PAYEE_TYPES.includes(template.payeeType as VoucherPayeeType)
    ? (template.payeeType as VoucherPayeeType)
    : "SUPPLIER";
  const payeeRef =
    template.payeeRef && typeof template.payeeRef === "object" ? (template.payeeRef as Record<string, unknown>) : {};
  const method: VoucherMethod = VOUCHER_METHODS.includes(template.method as VoucherMethod) ? (template.method as VoucherMethod) : "CASH";

  return {
    payeeType,
    supplierId: typeof payeeRef.supplierId === "string" ? payeeRef.supplierId : "",
    staffUserId: typeof payeeRef.staffUserId === "string" ? payeeRef.staffUserId : "",
    otherName: typeof payeeRef.name === "string" ? payeeRef.name : "",
    otherContact: typeof payeeRef.contact === "string" ? payeeRef.contact : "",
    categoryId: typeof template.categoryId === "string" ? template.categoryId : "",
    costCenterId: typeof template.costCenterId === "string" ? template.costCenterId : "",
    amount: typeof template.amount === "string" ? template.amount : "0.0000",
    method,
    narrative: typeof template.narrative === "string" ? template.narrative : "",
  };
}

export { VOUCHER_METHODS, VOUCHER_PAYEE_TYPES, type VoucherMethod, type VoucherPayeeType };

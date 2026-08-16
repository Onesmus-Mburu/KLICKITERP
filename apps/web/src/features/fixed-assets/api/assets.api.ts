import type { CreateFaAssetDto, FaAssetResponseDto, UpdateFaAssetConditionDto, UpdateFaAssetDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 23 Part 1 (Fixed Assets foundations, Module 17) — thin
 * wrapper over `AssetsController`
 * (`packages/server/src/domains/fixed-assets/api/assets.controller.ts`,
 * base `/api/v1/fixed-assets/assets`, tag `fixed-assets-assets`). Mutations
 * (`create`/`update`/`updateCondition`) need `fixed-assets:asset:manage`;
 * every read (`list`/`search`/`findByBarcode`/`findOne`) needs the
 * genuinely SEPARATE, narrower `fixed-assets:asset:view` — unlike
 * Categories (`categories.api.ts`), a real `:view`/`:manage` split exists
 * here, confirmed by reading the controller directly.
 *
 * **The zod-inferred `FaAssetResponseDto` (`@klickit/contracts`) is used
 * directly as this file's read-return type — checked directly against
 * `packages/contracts/src/domains/fixed-assets/asset.schema.ts`, not
 * assumed**: `serialNo`/`barcode`/`custodianUserId`/`supplierId`/`poId`/
 * `grnId`/`lifeMonthsOverride`/`insurance`/`photos` are all real nullable
 * types there. The RAW generated `openapi-types.ts` shape is the one with
 * gaps: every one of those 9 fields degrades to `Record<string, never> |
 * null` (`asset.dto.ts`'s own `FaAssetResponseDto` class carries
 * `@ApiProperty({ nullable: true })`/`{ format: "uuid", nullable: true }`
 * without an explicit `type:` on each, defeating NestJS/Swagger's
 * reflection — the same class of gap `lib/api-error.ts`'s own doc comment
 * documents for Students) — absorbed for free by using the zod type
 * directly, per `employees.api.ts`'s (Payroll Slice 22 Part 1) own
 * established precedent, never importing the raw `components["schemas"]`
 * type at all.
 *
 * **Request-body gap — narrower than the response side**: only `insurance`
 * (an opaque `Record<string, unknown>` jsonb, no fixed schema) degrades to
 * `Record<string, never> | null` on BOTH `CreateFaAssetDto`/
 * `UpdateFaAssetDto`'s RAW generated shape (`@ApiPropertyOptional({ type:
 * Object, nullable: true })` on the class — `type: Object` alone gives
 * `openapi-typescript` nothing to infer a real shape from). Every other
 * field on both DTOs generates cleanly (plain strings/uuids/dates/enums with
 * explicit type hints) — confirmed field-by-field, not assumed. Fixed the
 * same "cast only the one field that hits a real gap" way every sibling
 * `*.api.ts` file in this codebase already establishes.
 *
 * **8 create-only/immutable fields, confirmed by reading `UpdateFaAssetDto`
 * directly**: `code`/`acquisitionDate`/`cost`/`fundingSource`/`supplierId`/
 * `poId`/`grnId`/`inServiceFrom` — none of the 8 appear on the update DTO at
 * all. `edit-asset-dialog.tsx` omits all 8 entirely, matching this
 * codebase's standard "immutable fields get omitted from edit, not
 * disabled" precedent.
 *
 * **A second, genuinely different request-body gap on the update side —
 * found via `tsc`, not assumed**: `serialNo`/`barcode`/`custodianUserId`/
 * `lifeMonthsOverride`/`insurance` all carry `nullable: true` on their
 * Swagger annotation (confirmed by reading `asset.dto.ts`'s
 * `UpdateFaAssetDto` class directly) — genuinely clearable server-side
 * (`AssetsController.update()` passes `dto.serialNo` etc. straight to
 * `AssetsService.update()`, whose own `UpdateFaAssetInput` interface types
 * every one of these `T | null`) — but the DTO CLASS's own TS field type
 * omits `| null` (e.g. `serialNo?: string;`, not `serialNo?: string | null;`),
 * so BOTH the zod-inferred type AND the raw generated type type these
 * fields `T | undefined` only. `class-validator`'s `@IsOptional()` still
 * lets a literal `null` in the request body through untouched (it skips
 * every other decorator, including `@IsString()`, whenever the value is
 * `null` OR `undefined`), so sending `null` genuinely works at runtime —
 * this is a real type-level-only gap, not a functional one. Fixed via
 * `UpdateAssetInput` below (the wrapper's own accepted shape, `T | null` on
 * exactly these 5 fields) cast to `UpdateFaAssetRequestBody` at the
 * `apiClient` boundary — the same "cast at the one boundary that hits a
 * real gap" discipline every sibling `*.api.ts` file in this codebase
 * already establishes.
 *
 * **`residualValue` server-derivation**: `CreateFaAssetDto.residualValue` is
 * optional — when omitted, `AssetsService.create()` derives it as
 * `cost × category.residualPct`. This file never computes that figure
 * client-side; `create-asset-dialog.tsx` shows the real derivation as
 * helper copy instead of a client-side guess.
 *
 * **The list query's `categoryId`/`status`/`custodianUserId` are all
 * genuinely optional server-side (`@Query() categoryId?: string`, …) but
 * generate as REQUIRED plain `string`s on the RAW type** — the same
 * `AccountsController_list__banking`-class query-param gap `accounts.api.ts`
 * (Banking Slice 21 Part 1) already documents; fixed the identical
 * conditional-query-object way (each key omitted entirely when absent).
 *
 * **No clean 409 on duplicate `code`/`barcode`** before this part's own
 * opportunistic fix — `AssetsService.create()` now catches the raw `23505`
 * on either `uq_fa_asset_code` or `uq_fa_asset_barcode` and throws a real
 * `ConflictException` naming whichever one actually fired (see
 * `packages/server`'s own Slice 23 Part 1 change) — surfaced verbatim via
 * `ApiError.message` by every caller of `createAsset()` below.
 *
 * **`findByBarcode()` throws a real 404 on no match** (`AssetsService.findByBarcode()`
 * returns `null`, the controller throws `NotFoundException`) — confirmed by
 * reading the controller directly, not assumed. Callers must treat a caught
 * 404 from this specific call as a genuine "no asset with this barcode"
 * result, not an error toast — see `assets/page.tsx`'s own barcode-lookup
 * panel.
 */
interface AssetsListQueryShape {
  categoryId?: string;
  status?: string;
  custodianUserId?: string;
}

export interface ListFaAssetsParams {
  categoryId?: string;
  status?: string;
  custodianUserId?: string;
}

/** Mirrors the GENERATED (gapped) shape for `insurance` only — `Record<string, never> | null`, not `Record<string, unknown> | null` — see this file's own doc comment above. */
interface CreateFaAssetRequestBody extends Omit<CreateFaAssetDto, "insurance"> {
  insurance?: Record<string, never> | null;
}

interface UpdateFaAssetRequestBody
  extends Omit<UpdateFaAssetDto, "serialNo" | "barcode" | "custodianUserId" | "lifeMonthsOverride" | "insurance"> {
  serialNo?: string | null;
  barcode?: string | null;
  custodianUserId?: string | null;
  lifeMonthsOverride?: number | null;
  insurance?: Record<string, never> | null;
}

/**
 * This wrapper's OWN accepted shape for `updateAsset()` — mirrors
 * `UpdateFaAssetDto` field-for-field except the 5 fields the DTO class's own
 * TS type incorrectly omits `| null` from (see this file's own doc comment
 * above); `undefined` on any of the 5 omits the field entirely (leaves it
 * unchanged), `null` explicitly clears it.
 */
export interface UpdateAssetInput extends Omit<UpdateFaAssetDto, "serialNo" | "barcode" | "custodianUserId" | "lifeMonthsOverride" | "insurance"> {
  serialNo?: string | null;
  barcode?: string | null;
  custodianUserId?: string | null;
  lifeMonthsOverride?: number | null;
  insurance?: Record<string, unknown> | null;
}

export async function listAssets(params: ListFaAssetsParams = {}): Promise<FaAssetResponseDto[]> {
  const query: AssetsListQueryShape = {};
  if (params.categoryId !== undefined) query.categoryId = params.categoryId;
  if (params.status !== undefined) query.status = params.status;
  if (params.custodianUserId !== undefined) query.custodianUserId = params.custodianUserId;
  return unwrapApiResult<FaAssetResponseDto[]>(
    await apiClient.GET("/api/v1/fixed-assets/assets", { params: { query: query as unknown as Required<AssetsListQueryShape> } }),
  );
}

/** `ILIKE '%q%'` substring match against `code`/`barcode` ONLY, NOT `name` — confirmed by reading `FaAssetRepository.searchByCodeOrBarcode()` directly, no trigram/fuzzy name search exists for this entity (unlike Suppliers/Items elsewhere in this codebase). */
export async function searchAssets(q: string): Promise<FaAssetResponseDto[]> {
  return unwrapApiResult<FaAssetResponseDto[]>(await apiClient.GET("/api/v1/fixed-assets/assets/search", { params: { query: { q } } }));
}

/** Real 404 on no match — see this file's own doc comment above. */
export async function findAssetByBarcode(barcode: string): Promise<FaAssetResponseDto> {
  return unwrapApiResult<FaAssetResponseDto>(
    await apiClient.GET("/api/v1/fixed-assets/assets/barcode/{barcode}", { params: { path: { barcode } } }),
  );
}

export async function getAsset(id: string): Promise<FaAssetResponseDto> {
  return unwrapApiResult<FaAssetResponseDto>(await apiClient.GET("/api/v1/fixed-assets/assets/{id}", { params: { path: { id } } }));
}

/** `insurance` is the only field needing a boundary cast — see this file's own doc comment above. Every other field (including the 8 create-only ones) passes through `dto` untouched. */
export async function createAsset(dto: CreateFaAssetDto): Promise<FaAssetResponseDto> {
  return unwrapApiResult<FaAssetResponseDto>(
    await apiClient.POST("/api/v1/fixed-assets/assets", { body: dto as unknown as CreateFaAssetRequestBody }),
  );
}

/** The 8 create-only/immutable fields are never accepted by `UpdateFaAssetDto` at all — see this file's own doc comment above. Accepts `UpdateAssetInput`, not the raw `UpdateFaAssetDto`, so `null` can genuinely clear the 5 nullable fields — see this file's own doc comment above. */
export async function updateAsset(id: string, dto: UpdateAssetInput): Promise<FaAssetResponseDto> {
  return unwrapApiResult<FaAssetResponseDto>(
    await apiClient.PATCH("/api/v1/fixed-assets/assets/{id}", {
      params: { path: { id } },
      body: dto as unknown as UpdateFaAssetRequestBody,
    }),
  );
}

/** A single-field dedicated endpoint, separate from the general `updateAsset()` above — the verification/inspection entry point. */
export async function updateAssetCondition(id: string, dto: UpdateFaAssetConditionDto): Promise<FaAssetResponseDto> {
  return unwrapApiResult<FaAssetResponseDto>(
    await apiClient.PATCH("/api/v1/fixed-assets/assets/{id}/condition", { params: { path: { id } }, body: dto }),
  );
}

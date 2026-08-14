import type { CreateItemDto, ItemResponseDto, UpdateItemDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 19 Part 1 (Inventory Foundations, Module 13) — thin wrapper
 * over `ItemsController`
 * (`packages/server/src/domains/inventory/api/items.controller.ts`, base
 * `/api/v1/inventory/items`) — **this controller DOES split view vs manage**
 * (unlike Categories/Stores above): `inventory:item:view` gates all 4 GETs
 * (`list`/`search`/`findByBarcode`/`findOne`), `inventory:item:manage` gates
 * `create`/`update` (confirmed by reading the controller directly, 133
 * lines, each route's own `@RequirePermission` decorator checked
 * individually rather than assumed uniform).
 *
 * `CreateItemDto`/`UpdateItemDto`/`ItemResponseDto`
 * (`packages/contracts/src/domains/inventory/item.schema.ts`) have no
 * class-name collision anywhere else in `packages/server/src`
 * (grep-confirmed against `class CreateItemDto|class ItemResponseDto|class
 * UpdateItemDto`, exactly one hit each, all in `inventory/api/dto/item.dto.ts`)
 * and are flatly exported from `@klickit/contracts`'s root barrel — no
 * namespace workaround needed here, unlike `categories.api.ts`.
 *
 * Real codegen gaps found on `CreateItemDto`/`UpdateItemDto`'s generated
 * request-body shapes (checked field-by-field against
 * `packages/contracts/src/generated/openapi-types.ts` AND the real
 * class-validator source `item.dto.ts` directly, not assumed) — all the
 * SAME "opposite direction" class Slice 18 Part 1 first found on
 * `tradingName`/`kraPin` (the generated type is WIDER than the real one, not
 * narrower):
 * 1. `uomConversions` degrades to `Record<string, never> | null` (the
 *    `@ApiPropertyOptional({type: Object, nullable: true})` reflection gap
 *    `accounts.api.ts`'s own `taxTreatment` doc comment already documents).
 *    **This DOES force a cast at the call boundary despite `uomConversions`
 *    having no UI field anywhere in this feature** — a real, confirmed
 *    `tsc --noEmit` failure caught while writing this file: TypeScript
 *    checks structural assignability of the whole `CreateItemDto`/
 *    `UpdateItemDto` type, not just the fields a given call site happens to
 *    populate at runtime, so the real (`Record<string, unknown> | undefined`)
 *    and generated (`Record<string, never> | null | undefined`) shapes for
 *    this ONE field are enough to make the WHOLE object type incompatible,
 *    even with `uomConversions` always left `undefined` in practice. Fixed
 *    the same way as every prior gap: `CreateItemRequestBody`/
 *    `UpdateItemRequestBody` below mirror the GENERATED shape, cast at the
 *    `apiClient.POST`/`.PATCH` boundary.
 * 2. `barcode`/`preferredSupplierIds`/`glIncomeAccountId` all gain a
 *    generated `| null` that the real, zod-inferred contracts type doesn't
 *    have (`string | undefined`/`string[] | undefined`/`string | undefined`
 *    respectively) — real backend DOES accept `null` for all three
 *    (`@IsOptional()` short-circuits class-validator's other checks for both
 *    `undefined` AND `null`, confirmed by reading `item.dto.ts` directly),
 *    the zod mirror just didn't carry a `.nullable()` flag over. Harmless
 *    once the same request-body interface already mirrors the generated
 *    shape for gap #1 above — these three fields ride along in the same
 *    cast, this pass just never actually POPULATES an explicit `null` for
 *    any of them (create omits an unset field entirely; the edit dialog's
 *    own `preferredSupplierIds` diff sends a real `string[]`, including
 *    `[]` to clear — a plain empty array, not `null`, is sufficient).
 *
 * No REQUIRED-vs-optional flip exists on either request body (no Swagger
 * `default` anywhere in `item.dto.ts`, confirmed directly) — every OTHER
 * field stays correctly optional in the generated shape too.
 *
 * Query-param gaps are the now-familiar class: `ItemsController_list`'s
 * `categoryId`/`itemType`/`isActive` and `ItemsController_search`'s
 * `q`/`limit` are all generated as required (non-optional) strings even
 * though the real controller treats every one of them as optional except
 * `search`'s own `q` — fixed with the same conditional-query-object pattern
 * every prior `*.api.ts` file in this codebase already establishes.
 *
 * **`findItemByBarcode()` returns `ItemResponseDto | null` for "no match" —
 * a real 200, not a 404 — but the WIRE-LEVEL body is genuinely EMPTY (0
 * bytes), not a literal JSON `null`, a real finding confirmed by
 * byte-inspecting a raw `curl` response during this part's own live
 * verification, not assumed from the controller's source alone**:
 * `ItemsController.findByBarcode()`'s own `return item ? toView(item) :
 * null` looks like it should serialize to a 4-byte `null` body, but
 * NestJS's Express adapter treats a controller method returning JS `null`
 * identically to `undefined` (both are "no body" as far as the HTTP
 * response is concerned) — so the real response has `Content-Length: 0`,
 * no body at all. `openapi-fetch` (confirmed by reading
 * `node_modules/openapi-fetch/src/index.js` directly) already handles this
 * defensively: a `Content-Length: 0` response short-circuits straight to
 * `{data: undefined, response}` without attempting a JSON parse (which
 * would otherwise throw `Unexpected end of JSON input` on an empty body) —
 * so this does NOT crash, but the value flowing through `unwrapApiResult()`
 * is `undefined`, not `null`. `findItemByBarcode()` below explicitly
 * coerces `undefined -> null` at this one call site so its own declared
 * `Promise<ItemResponseDto | null>` return type (matching the OpenAPI doc's
 * own documented `null`) is honestly true at runtime too, not just a type
 * annotation papering over a real `undefined`/`null` mismatch a future
 * caller doing a strict `=== null` check could otherwise be tripped up by.
 * Callers still treat the resolved `null` as an expected, valid "no match"
 * outcome, never branch on it as an error.
 */
interface ItemsListQueryShape {
  categoryId?: string;
  itemType?: string;
  isActive?: string;
}

interface ItemsSearchQueryShape {
  q: string;
  limit?: string;
}

export type InvItemType = "STOCK" | "CONSUMABLE" | "SERVICE" | "RESALE";

/** Mirrors `CreateItemDto`'s GENERATED (gapped) shape: `uomConversions`/`barcode`/`preferredSupplierIds`/`glIncomeAccountId` all widened with `| null` — see this file's own doc comment above. */
interface CreateItemRequestBody {
  code: string;
  name: string;
  categoryId: string;
  uom: string;
  uomConversions?: Record<string, never> | null;
  barcode?: string | null;
  itemType: InvItemType;
  reorderLevel?: string;
  reorderQty?: string;
  preferredSupplierIds?: string[] | null;
  glAssetAccountId: string;
  glExpenseAccountId: string;
  glIncomeAccountId?: string | null;
  salePrice?: string;
}

/** Mirrors `UpdateItemDto`'s GENERATED (gapped) shape — see this file's own doc comment above. */
interface UpdateItemRequestBody {
  name?: string;
  categoryId?: string;
  uom?: string;
  uomConversions?: Record<string, never> | null;
  barcode?: string | null;
  itemType?: InvItemType;
  reorderLevel?: string;
  reorderQty?: string;
  preferredSupplierIds?: string[] | null;
  glAssetAccountId?: string;
  glExpenseAccountId?: string;
  glIncomeAccountId?: string | null;
  salePrice?: string;
  isActive?: boolean;
}

export interface ListItemsParams {
  categoryId?: string;
  itemType?: InvItemType;
  isActive?: boolean;
}

export async function listItems(params: ListItemsParams = {}): Promise<ItemResponseDto[]> {
  const query: ItemsListQueryShape = {};
  if (params.categoryId !== undefined) query.categoryId = params.categoryId;
  if (params.itemType !== undefined) query.itemType = params.itemType;
  if (params.isActive !== undefined) query.isActive = String(params.isActive);
  return unwrapApiResult<ItemResponseDto[]>(
    await apiClient.GET("/api/v1/inventory/items", { params: { query: query as unknown as Required<ItemsListQueryShape> } }),
  );
}

/** Trigram search on `name` (`ItemsController.search()`) — the `<ItemCombobox>`'s primary data source, a separate endpoint from `listItems()`, not a client-side filter over it. */
export async function searchItems(q: string, limit?: number): Promise<ItemResponseDto[]> {
  const query: ItemsSearchQueryShape = { q };
  if (limit !== undefined) query.limit = String(limit);
  return unwrapApiResult<ItemResponseDto[]>(
    await apiClient.GET("/api/v1/inventory/items/search", { params: { query: query as unknown as Required<ItemsSearchQueryShape> } }),
  );
}

/** Real `null` (not a 404) when no item has this barcode — a genuine, expected "no match" outcome, see this file's own doc comment. */
export async function findItemByBarcode(barcode: string): Promise<ItemResponseDto | null> {
  const result = await apiClient.GET("/api/v1/inventory/items/barcode/{barcode}", { params: { path: { barcode } } });
  // `?? null` normalizes the real `undefined` (empty-body response) to the declared `null` — see this file's own doc comment above.
  return unwrapApiResult<ItemResponseDto | undefined>(result) ?? null;
}

export async function getItem(id: string): Promise<ItemResponseDto> {
  return unwrapApiResult<ItemResponseDto>(await apiClient.GET("/api/v1/inventory/items/{id}", { params: { path: { id } } }));
}

/**
 * BR-INV-04 enforced server-side: a RESALE item must carry both `salePrice`
 * and `glIncomeAccountId`, or this genuinely 422s (confirmed live, real
 * `ValidationException`, clean rejection). **A duplicate `code` (unique) or
 * `barcode` (unique-if-present) is a DIFFERENT story — confirmed live as a
 * raw `500 INTERNAL_ERROR`** (`duplicate key value violates unique
 * constraint "uq_inv_item_code"` leaking verbatim), the exact same
 * unhandled-`QueryFailedError` gap `categories.api.ts`'s own doc comment
 * documents for `createCategory()`/`createStore()` — `ItemsService.create()`
 * has no try/catch around either unique constraint either. Out of scope to
 * fix here (`packages/server`, frontend-only part).
 */
export async function createItem(dto: CreateItemDto): Promise<ItemResponseDto> {
  return unwrapApiResult<ItemResponseDto>(
    await apiClient.POST("/api/v1/inventory/items", { body: dto as unknown as CreateItemRequestBody }),
  );
}

/** BR-INV-04 re-checked server-side on every update. */
export async function updateItem(id: string, dto: UpdateItemDto): Promise<ItemResponseDto> {
  return unwrapApiResult<ItemResponseDto>(
    await apiClient.PATCH("/api/v1/inventory/items/{id}", { params: { path: { id } }, body: dto as unknown as UpdateItemRequestBody }),
  );
}

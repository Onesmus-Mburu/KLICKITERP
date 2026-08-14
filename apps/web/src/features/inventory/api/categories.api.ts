import type { domains_inventory_category_schema } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 19 Part 1 (Inventory Foundations, Module 13) — thin wrapper
 * over `CategoriesController`
 * (`packages/server/src/domains/inventory/api/categories.controller.ts`,
 * base `/api/v1/inventory/categories`) — a single shared
 * `inventory:category:manage` permission gates ALL 4 routes, including both
 * GETs (confirmed by reading the controller directly, 53 lines, every route
 * decorated with the same `@RequirePermission("inventory:category:manage")`)
 * — unlike Items below, there is no separate `...:view` permission here.
 *
 * **`CreateCategoryDto`/`UpdateCategoryDto`/`CategoryResponseDto` are NOT
 * imported flat from `@klickit/contracts` — a genuinely new, more severe
 * class of codegen gap than every prior slice's own nullable-field/
 * required-query-param findings**: `packages/server/src/domains/expenses/api/dto/category.dto.ts`
 * declares classes with the EXACT SAME NAMES (`CreateCategoryDto`,
 * `UpdateCategoryDto`, `CategoryResponseDto`) as this domain's own
 * `packages/server/src/domains/inventory/api/dto/category.dto.ts` (confirmed
 * by reading BOTH files directly, not assumed) — `@nestjs/swagger`'s schema
 * registry collides on the shared class name, and `packages/contracts/src/generated/openapi-types.ts`'s
 * `components["schemas"]["CreateCategoryDto"]` ends up reflecting EXPENSES'
 * much richer shape (`{name, parentId?, glExpenseAccountId: uuid (required),
 * budgetRequired: boolean, isActive: boolean}`) everywhere that name is
 * referenced — including inside `operations["CategoriesController_create"]`'s
 * own generated request-body type for THIS (inventory) endpoint, even though
 * the real, running `CategoriesController.create()` route only ever reads
 * `dto.name`/`dto.parentId` (confirmed by reading the controller directly)
 * and inventory's own real DTO is the far narrower `{name: string, parentId?:
 * uuid}`. `packages/contracts/src/index.ts`'s own generator already
 * recognized this collision and re-exports inventory's correct, narrow
 * versions under a NAMESPACE instead of a flat name (`export * as
 * domains_inventory_category_schema from "./domains/inventory/category.schema"`,
 * its own doc comment: "some entries are namespaced instead of flat —
 * duplicate DTO class names across unrelated modules") — the exact same
 * mechanism `features/wallet/api/wallets.api.ts`'s own
 * `domains_wallet_wallet_transaction_schema` doc comment already established
 * and verified working for a different collision, followed here rather than
 * reinvented. **A flat `import type { CreateCategoryDto } from
 * "@klickit/contracts"` would silently resolve to the WRONG (expenses)
 * shape** — reached via the namespace below instead, never the flat name.
 *
 * Net effect on this file's own typing: the REAL (correct, narrow) DTOs come
 * from the namespace for every function signature and the `unwrapApiResult<T>`
 * response-side type argument (response-side needs no cast regardless,
 * `lib/api-error.ts`'s own doc comment already loosens `unwrapApiResult`'s
 * `data` param to `unknown`). Only the REQUEST-BODY call boundary
 * (`apiClient.POST`/`.PATCH`, which openapi-fetch types strictly against the
 * GENERATED — collided — shape) needs the same "local interface mirrors the
 * GENERATED shape, cast at the boundary" fix Slice 17/18 already established
 * for the narrower nullable-field/Swagger-`default` gaps — `CreateCategoryRequestBody`/
 * `UpdateCategoryRequestBody` below mirror EXPENSES' shape structurally (so
 * the cast type-checks), but this file only ever POPULATES the real
 * inventory fields (`name`/`parentId`) at runtime — the extra
 * `glExpenseAccountId`/`budgetRequired`/`isActive` keys the generated type
 * demands are NEVER actually sent on the wire, `as unknown as X` bypasses
 * runtime enforcement of them entirely, confirmed correct via a real `pnpm
 * --filter web exec tsc --noEmit` run.
 *
 * The list query param gap is the now-familiar class: `CategoriesController_list`'s
 * generated `parentId` query param is a required (non-optional) `string`,
 * even though the real controller (`@Query("parentId") parentId?: string`)
 * treats it as genuinely optional AND semantically three-valued — omitted
 * entirely means "all categories" (`categoriesService.listAll()`), an
 * explicit empty string means "root-level only" (`listByParent(null)`), and
 * a real id means "children of that parent" (confirmed by reading
 * `CategoriesController.list()` directly). `listCategories()` below
 * preserves all three states via a CONDITIONAL query object keyed off
 * `parentId !== undefined` (not `parentId` truthiness — an empty string must
 * still be included in the query object to reach the "root-level" branch).
 */
type CreateCategoryDto = domains_inventory_category_schema.CreateCategoryDto;
type UpdateCategoryDto = domains_inventory_category_schema.UpdateCategoryDto;
type CategoryResponseDto = domains_inventory_category_schema.CategoryResponseDto;

interface CategoriesListQueryShape {
  parentId?: string;
}

/** Mirrors the GENERATED (expenses-collided) `CreateCategoryDto` shape at this call boundary only — see this file's own doc comment. Runtime body sent is always just `{name, parentId?}`. */
interface CreateCategoryRequestBody {
  name: string;
  parentId?: string | null;
  glExpenseAccountId: string;
  budgetRequired: boolean;
  isActive: boolean;
}

/**
 * Mirrors the GENERATED (expenses-collided) `UpdateCategoryDto` shape at
 * this call boundary only — see this file's own doc comment. `parentId`
 * ALSO carries a second, independent gap on top of the schema collision:
 * expenses' own `UpdateCategoryDto.parentId` class field is typed
 * `parentId?: string | null` (an explicit union) rather than plain
 * `parentId?: string`, and NestJS/Swagger's reflection can't infer a TS type
 * from a union return type (the same `taxTreatment`/`Record<string, never>`
 * gap `accounts.api.ts` already documents) — so the generated shape here is
 * `parentId?: Record<string, never> | null`, NOT `string | null` as this
 * file's own earlier draft assumed and a real `tsc --noEmit` run caught.
 * Confirmed asymmetric with `CreateCategoryRequestBody.parentId` above,
 * which stays plain `string | null` (expenses' own `CreateCategoryDto.parentId`
 * class field has no explicit union, just `parentId?: string`, so reflection
 * succeeds there).
 */
interface UpdateCategoryRequestBody {
  name?: string;
  parentId?: Record<string, never> | null;
  glExpenseAccountId?: string;
  budgetRequired?: boolean;
  isActive?: boolean;
}

/** Omit `parentId` for every category; pass `""` for root-level only; pass a real id for that parent's children. */
export async function listCategories(parentId?: string): Promise<CategoryResponseDto[]> {
  const query: CategoriesListQueryShape = {};
  if (parentId !== undefined) query.parentId = parentId;
  return unwrapApiResult<CategoryResponseDto[]>(
    await apiClient.GET("/api/v1/inventory/categories", { params: { query: query as unknown as Required<CategoriesListQueryShape> } }),
  );
}

export async function getCategory(id: string): Promise<CategoryResponseDto> {
  return unwrapApiResult<CategoryResponseDto>(await apiClient.GET("/api/v1/inventory/categories/{id}", { params: { path: { id } } }));
}

/**
 * Globally-unique `name` (not unique-per-parent) — a duplicate-name create
 * attempt is rejected and surfaced as a real `ApiError` for the caller to
 * display. **A genuine, previously-undocumented backend finding from this
 * part's own live verification (not assumed from the plan's own "409/422"
 * phrasing): the real rejection is a raw `500 INTERNAL_ERROR`**, not a clean
 * 409/422 — confirmed live (`duplicate key value violates unique constraint
 * "uq_inv_category_name"` leaking verbatim in the response body) and by
 * reading `CategoriesService.create()`/`AllExceptionsFilter` directly:
 * `create()` has no try/catch around the unique-constraint violation at
 * all, and the global filter's `mapException()` only special-cases
 * `DomainException`/`HttpException` — a raw TypeORM `QueryFailedError` falls
 * through to the generic 500 branch, with no DB-error-code (`23505`)
 * sniffing anywhere in this codebase's exception pipeline. The exact same
 * gap was independently confirmed live for `createStore()`/`createItem()`
 * below and in `items.api.ts` — a systemic gap across all 3 of this part's
 * create paths, not an isolated one-off. Out of scope to fix here
 * (`packages/server`, frontend-only part) — `ApiError`'s generic
 * `err.message` fallback (`create-category-dialog.tsx`'s own catch block)
 * still surfaces SOMETHING to the user regardless of status code, just the
 * raw SQL constraint name instead of a clean "name already in use" message.
 */
export async function createCategory(dto: CreateCategoryDto): Promise<CategoryResponseDto> {
  return unwrapApiResult<CategoryResponseDto>(
    await apiClient.POST("/api/v1/inventory/categories", { body: dto as unknown as CreateCategoryRequestBody }),
  );
}

/** `parentId` accepts explicit `null` to clear it — the REAL, namespaced `UpdateCategoryDto.parentId` type (`string | null | undefined`) is what callers of THIS function use; the generated-shape gap on this same field is handled entirely inside `UpdateCategoryRequestBody`'s own cast boundary above. */
export async function updateCategory(id: string, dto: UpdateCategoryDto): Promise<CategoryResponseDto> {
  return unwrapApiResult<CategoryResponseDto>(
    await apiClient.PATCH("/api/v1/inventory/categories/{id}", { params: { path: { id } }, body: dto as unknown as UpdateCategoryRequestBody }),
  );
}

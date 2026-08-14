import type { CategoryResponseDto, CreateCategoryDto, UpdateCategoryDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 20 Part 1 (Expenses Foundations, Module 14) — thin wrapper
 * over `CategoriesController` (`packages/server/src/domains/expenses/api/categories.controller.ts`,
 * base `/api/v1/expenses/categories`) — a single shared `expenses:category:manage`
 * permission gates ALL 4 routes, including both GETs (confirmed by reading
 * the controller directly, 69 lines) — the same "one bundled permission, no
 * separate view" shape Inventory's own Categories/Stores (Slice 19 Part 1)
 * already established.
 *
 * **The OPPOSITE schema-collision direction from Slice 19 Part 1's own
 * finding — verified directly, not assumed**: `packages/server/src/domains/inventory/api/dto/category.dto.ts`
 * and THIS domain's own `packages/server/src/domains/expenses/api/dto/category.dto.ts`
 * both declare classes named `CreateCategoryDto`/`UpdateCategoryDto`/
 * `CategoryResponseDto` — `@nestjs/swagger`'s schema registry collides on the
 * shared name, and `packages/contracts/src/index.ts`'s own generator resolved
 * it by re-exporting INVENTORY's narrower shape under a namespace
 * (`export * as domains_inventory_category_schema from "./domains/inventory/category.schema"`,
 * confirmed by reading that line directly) while leaving EXPENSES' own richer
 * shape as the FLAT, un-namespaced `CreateCategoryDto`/`UpdateCategoryDto`/
 * `CategoryResponseDto` names — meaning THIS domain (unlike Inventory's own
 * `categories.api.ts`) needs no namespace import at all: the flat
 * `@klickit/contracts` names already resolve correctly here. Confirmed two
 * ways before trusting it: (1) `packages/contracts/src/domains/expenses/category.schema.ts`
 * (the flat, un-namespaced zod mirror) declares exactly this domain's own
 * `{name, parentId?, glExpenseAccountId, budgetRequired?, isActive?}` shape;
 * (2) `packages/contracts/src/generated/openapi-types.ts`'s own
 * `components["schemas"]["CreateCategoryDto"]`/`.CategoryResponseDto`/
 * `.UpdateCategoryDto` reflect Expenses' exact shape (`{name, parentId?,
 * glExpenseAccountId: uuid (required), budgetRequired, isActive}`), not
 * Inventory's narrower `{name, parentId?}` — this is the accurate, intended
 * pairing for `POST/GET/PATCH /api/v1/expenses/categories*` regardless (those
 * operations are separately suffixed `__expenses` in the generated
 * `operations` map to disambiguate from Inventory's own identically-named
 * routes, but both resolve to the SAME shared `components["schemas"]` entries
 * either way — confirmed by reading the generated `paths["/api/v1/expenses/categories"]`
 * entry directly).
 *
 * **Two real request-body gaps found, both against the GENERATED type**:
 * 1. `CreateCategoryDto.budgetRequired`/`.isActive` both lose their `?`
 *    entirely (required booleans in the generated body type) —
 *    `category.dto.ts`'s own `@ApiPropertyOptional({ default: false })`/
 *    `{ default: true })` decorators each carry a Swagger `default`, the
 *    exact same `openapi-typescript` quirk `CreateAccountDto.isControl`/
 *    `CreateSupplierDto.paymentTermsDays` already documented in Slices 17/18.
 *    Fixed the same way: `CreateCategoryRequestBody` mirrors the GENERATED
 *    (gapped) shape, cast at the `apiClient.POST` boundary.
 * 2. `UpdateCategoryDto.parentId` degrades to `Record<string, never> | null`
 *    (not `string | null`) — `category.dto.ts`'s own `UpdateCategoryDto.parentId?:
 *    string | null` field carries an EXPLICIT union type, and NestJS/Swagger's
 *    reflection can't infer a TS type from a union field type (the same
 *    `taxTreatment`/`Record<string, never>` gap `accounts.api.ts` already
 *    documents) — confirmed asymmetric with `CreateCategoryDto.parentId`
 *    (that class field has NO explicit union, just `parentId?: string`, so
 *    reflection succeeds and the generated type stays the correct
 *    `string | null`, no gap there). `UpdateCategoryRequestBody` mirrors this
 *    one gapped field, cast at the `apiClient.PATCH` boundary.
 *
 * Response-side (`CategoryResponseDto.parentId` also degrades to the same
 * `Record<string, never> | null`) needs no cast anywhere — `unwrapApiResult<T>()`'s
 * `data: unknown` parameter already absorbs it, and the REAL, correctly-typed
 * `CategoryResponseDto` (from `@klickit/contracts`'s zod mirror, `parentId:
 * string | null`) is what every caller of this file actually gets back.
 *
 * **`parentId` query param — a real, DIFFERENT-from-Inventory's-own semantic,
 * confirmed by reading `CategoriesController.list()` directly, not assumed
 * from Slice 19 Part 1's own precedent**: omitted entirely -> every category
 * regardless of depth; the LITERAL STRING `"null"` -> root-level only
 * (`const filter = parentId === undefined ? undefined : parentId === "null" ? null : parentId`,
 * copied verbatim from the controller); any other string -> that parent's own
 * children. Inventory's OWN categories endpoint instead uses an EMPTY STRING
 * for "root-level only" (`features/inventory/api/categories.api.ts`'s own doc
 * comment) — a real, deliberate divergence between the two controllers, not a
 * copy-paste of the same convention. `CategoriesController_list__expenses`'s
 * generated query-param type requires `parentId` as a plain (non-optional)
 * `string`, even though the real controller (`@Query("parentId") parentId?: string`)
 * treats it as genuinely optional — the same standing class of gap every
 * prior `*.api.ts` file in this codebase already documents; fixed the same
 * conditional-query-object way.
 */
interface CategoriesListQueryShape {
  parentId?: string;
}

/** Mirrors `CreateCategoryDto`'s GENERATED (gapped) shape: `budgetRequired`/`isActive` required (not optional) — see this file's own doc comment above. */
interface CreateCategoryRequestBody {
  name: string;
  parentId?: string | null;
  glExpenseAccountId: string;
  budgetRequired: boolean;
  isActive: boolean;
}

/** Mirrors `UpdateCategoryDto`'s GENERATED (gapped) shape: `parentId` as `Record<string, never> | null`, not `string | null` — see this file's own doc comment above. */
interface UpdateCategoryRequestBody {
  name?: string;
  parentId?: Record<string, never> | null;
  glExpenseAccountId?: string;
  budgetRequired?: boolean;
  isActive?: boolean;
}

/** Omit `parentId` for every category, any depth; pass the literal string `"null"` for root-level only; pass a real id for that parent's own children. */
export async function listCategories(parentId?: string): Promise<CategoryResponseDto[]> {
  const query: CategoriesListQueryShape = {};
  if (parentId !== undefined) query.parentId = parentId;
  return unwrapApiResult<CategoryResponseDto[]>(
    await apiClient.GET("/api/v1/expenses/categories", { params: { query: query as unknown as Required<CategoriesListQueryShape> } }),
  );
}

export async function getCategory(id: string): Promise<CategoryResponseDto> {
  return unwrapApiResult<CategoryResponseDto>(await apiClient.GET("/api/v1/expenses/categories/{id}", { params: { path: { id } } }));
}

/**
 * BR-EXP-01, server-enforced: `glExpenseAccountId` must resolve to a valid,
 * active, postable EXPENSE-class `gl_account` — the rejection message is
 * surfaced verbatim via `ApiError.message` if it occurs; this dialog never
 * duplicates that validation client-side beyond offering the account picker
 * itself (already filtered to postable EXPENSE-class accounts, see
 * `create-category-dialog.tsx`), which naturally only offers valid choices.
 */
export async function createCategory(dto: CreateCategoryDto): Promise<CategoryResponseDto> {
  return unwrapApiResult<CategoryResponseDto>(
    await apiClient.POST("/api/v1/expenses/categories", { body: dto as unknown as CreateCategoryRequestBody }),
  );
}

/** `parentId` accepts explicit `null` to clear it — the REAL, correctly-typed `UpdateCategoryDto.parentId` (`string | null | undefined`) is what callers of THIS function use; the generated-shape gap on this one field is handled entirely inside `UpdateCategoryRequestBody`'s own cast boundary above. */
export async function updateCategory(id: string, dto: UpdateCategoryDto): Promise<CategoryResponseDto> {
  return unwrapApiResult<CategoryResponseDto>(
    await apiClient.PATCH("/api/v1/expenses/categories/{id}", {
      params: { path: { id } },
      body: dto as unknown as UpdateCategoryRequestBody,
    }),
  );
}

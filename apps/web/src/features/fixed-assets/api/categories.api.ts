import type { CreateFaCategoryDto, FaCategoryResponseDto, UpdateFaCategoryDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 23 Part 1 (Fixed Assets foundations, Module 17) — thin
 * wrapper over `CategoriesController`
 * (`packages/server/src/domains/fixed-assets/api/categories.controller.ts`,
 * base `/api/v1/fixed-assets/categories`, tag `fixed-assets-categories`) — a
 * SINGLE shared `fixed-assets:category:manage` permission gates ALL 4
 * routes, including the LIST/detail GETs (confirmed by reading the
 * controller directly, 67 lines — no separate `:view` permission exists at
 * all). A role missing it can't even list categories — a real, documented
 * gap, not something this file works around.
 *
 * **Zero request/response-body codegen gap on this DTO family — checked
 * directly against both `packages/contracts/src/domains/fixed-assets/category.schema.ts`
 * (the zod-inferred types, used directly below) AND the RAW generated
 * `openapi-types.ts`, not assumed either way**: every field on
 * `CreateFaCategoryDto`/`UpdateFaCategoryDto`/`FaCategoryResponseDto` is a
 * plain string/number/uuid/enum with an explicit type hint on its
 * `@ApiProperty()`/`@ApiPropertyOptional()` decorator (no `type: Object`, no
 * union-typed nullable field missing an explicit `type:`), so NestJS/
 * Swagger's reflection succeeds everywhere and `openapi-typescript` never
 * degrades anything to `Record<string, never>` — the same "zero gap,
 * confirmed not assumed" story `salary-structures.api.ts` (Payroll Slice 22
 * Part 2) already established for its own header DTO. No cast is needed on
 * any call below.
 *
 * **`UpdateFaCategoryDto` is genuinely, fully editable — including `name`
 * and `method`** — confirmed by reading `CategoriesService.update()`
 * directly: nothing on this entity is create-only/immutable, a real
 * exception to this codebase's usual "immutable fields get omitted from
 * edit" pattern (Assets, below in `assets.api.ts`, is the opposite case).
 *
 * **`rate` is required (and must be > 0) whenever `method='RB'`, but only at
 * the SERVICE layer, not the DTO** — `CreateFaCategoryDto.rate`/
 * `UpdateFaCategoryDto.rate` are both plain optional fields; a `method='RB'`
 * create/update with no `rate` throws a real `ValidationException` (422),
 * surfaced verbatim via `ApiError.message`. `create-category-dialog.tsx`/
 * `edit-category-dialog.tsx` both require `rate` client-side whenever `RB`
 * is selected, purely as a UX nicety — the real enforcement is server-side.
 *
 * **No clean 409 on duplicate `name`** (`uq_fa_category_name`) before this
 * part's own opportunistic fix — `CategoriesService.create()`/`.update()`
 * now catch the raw `23505` and throw a real `ConflictException` (see
 * `packages/server`'s own Slice 23 Part 1 change, live-reverified — this
 * file's callers surface it verbatim via `ApiError.message` like every other
 * unique-constrained entity in this codebase).
 */
export async function listCategories(): Promise<FaCategoryResponseDto[]> {
  return unwrapApiResult<FaCategoryResponseDto[]>(await apiClient.GET("/api/v1/fixed-assets/categories", {}));
}

export async function getCategory(id: string): Promise<FaCategoryResponseDto> {
  return unwrapApiResult<FaCategoryResponseDto>(
    await apiClient.GET("/api/v1/fixed-assets/categories/{id}", { params: { path: { id } } }),
  );
}

export async function createCategory(dto: CreateFaCategoryDto): Promise<FaCategoryResponseDto> {
  return unwrapApiResult<FaCategoryResponseDto>(await apiClient.POST("/api/v1/fixed-assets/categories", { body: dto }));
}

export async function updateCategory(id: string, dto: UpdateFaCategoryDto): Promise<FaCategoryResponseDto> {
  return unwrapApiResult<FaCategoryResponseDto>(
    await apiClient.PATCH("/api/v1/fixed-assets/categories/{id}", { params: { path: { id } }, body: dto }),
  );
}

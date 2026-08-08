import type { CreateCustomFieldDto, UpdateCustomFieldDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import type { CustomFieldDefResponse, CustomFieldEntityType } from "../types";
import { optionalQuery } from "./query-params";

/**
 * Thin wrapper over `CustomFieldsController`
 * (`packages/server/src/platform/settings/api/custom-fields.controller.ts`)
 * — `settings:custom-field:view` covers list/get, `settings:custom-field:manage`
 * covers create/update (confirmed by reading the controller directly). No
 * delete wrapper exists here because no delete endpoint exists on the
 * controller at all — deliberate, per `CustomFieldService`'s own doc
 * comment ("mirrors `RolesService`/`DepartmentsService`'s pattern of no
 * delete for referenced definitional rows"). `UpdateCustomFieldDto` only
 * carries `label`/`options`/`isRequired` (confirmed directly in
 * `update-custom-field.dto.ts`) — `entity`/`key`/`fieldType` are genuinely
 * immutable post-creation, not merely hidden by this wrapper.
 *
 * **A real, confirmed codegen gap on `options` specifically**: both
 * `CreateCustomFieldDto`/`UpdateCustomFieldDto`'s server-side `options` field
 * is declared `@ApiPropertyOptional()` with NO explicit `type` (it's
 * genuinely unvalidated `unknown` JSON, per `create-custom-field.dto.ts`) —
 * `@nestjs/swagger` can't infer a schema from a bare `unknown` TS type, so
 * the generated OpenAPI schema for `options` has no real shape, and
 * `openapi-typescript` emits `Record<string, never>` (an empty-object-only
 * type) for it in `generated/openapi-types.ts` — confirmed directly. That
 * doesn't structurally match `@klickit/contracts`' own zod-inferred
 * `options?: unknown` type, which is what `CreateCustomFieldDto`/
 * `UpdateCustomFieldDto` (the flatly-exported symbols this file imports)
 * actually resolve to. The SAME class of gap `lib/api-error.ts`'s own doc
 * comment documents for `unwrapApiResult`'s `data` parameter — fixed the
 * same way `features/payments/api/sessions.api.ts`'s own `closeSession()`
 * fixes the identical class of gap: a targeted `as unknown as {...}` cast at
 * the one call boundary that hits it, matching the REAL generated request
 * shape field-for-field (not a loose `Record<string, unknown>`, which
 * doesn't structurally satisfy the generated client's specific expected
 * body type) — not a workaround baked into the DTO type itself (the real
 * runtime JSON round-trips correctly either way — this is a
 * TypeScript-level annotation gap, not a runtime bug).
 */
export async function listCustomFields(entity?: CustomFieldEntityType): Promise<CustomFieldDefResponse[]> {
  return unwrapApiResult<CustomFieldDefResponse[]>(
    await apiClient.GET("/api/v1/custom-fields", { params: { query: optionalQuery({ entity }) } }),
  );
}

interface CreateCustomFieldRequestBody {
  entity: CustomFieldEntityType;
  key: string;
  label: string;
  fieldType: "TEXT" | "NUMBER" | "DATE" | "SELECT";
  options?: Record<string, never>;
  isRequired: boolean;
}

interface UpdateCustomFieldRequestBody {
  label?: string;
  options?: Record<string, never>;
  isRequired?: boolean;
}

export async function createCustomField(dto: CreateCustomFieldDto): Promise<CustomFieldDefResponse> {
  return unwrapApiResult<CustomFieldDefResponse>(
    await apiClient.POST("/api/v1/custom-fields", { body: dto as unknown as CreateCustomFieldRequestBody }),
  );
}

export async function getCustomField(id: string): Promise<CustomFieldDefResponse> {
  return unwrapApiResult<CustomFieldDefResponse>(await apiClient.GET("/api/v1/custom-fields/{id}", { params: { path: { id } } }));
}

export async function updateCustomField(id: string, dto: UpdateCustomFieldDto): Promise<CustomFieldDefResponse> {
  return unwrapApiResult<CustomFieldDefResponse>(
    await apiClient.PATCH("/api/v1/custom-fields/{id}", { params: { path: { id } }, body: dto as unknown as UpdateCustomFieldRequestBody }),
  );
}

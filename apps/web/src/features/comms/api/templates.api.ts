import type { CreateTemplateDto, TemplateResponseDto, UpdateTemplateDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `TemplatesController`
 * (`packages/server/src/platform/comms/api/templates.controller.ts`) —
 * `comms:template:view` covers list/get, `comms:template:manage` covers
 * create/update/delete (confirmed by reading the controller directly).
 * Response/request types (`TemplateResponseDto`/`CreateTemplateDto`/
 * `UpdateTemplateDto`) are real, generated types imported directly from
 * `@klickit/contracts` — no hand-typed `types.ts` needed, mirroring
 * `features/roles/api/roles.api.ts`'s own shape.
 *
 * **A real, confirmed codegen gap on `locale`/`isActive`/`variables`
 * specifically** — the same class of gap `features/roles/api/roles.api.ts`
 * documents for `isAuditorClass` and `features/settings/api/custom-fields
 * .api.ts` documents for `options`. Server-side, `CreateTemplateDto.locale`/
 * `.isActive` are `@ApiPropertyOptional({ default: ... })` (genuinely
 * optional, confirmed by reading `create-template.dto.ts` directly, and
 * `@klickit/contracts`' zod-inferred type correctly mirrors that as
 * `locale?: string` / `isActive?: boolean`) — but `@nestjs/swagger` drops
 * the "optional" signal for this `@ApiPropertyOptional({default})` shape
 * (the exact `isAuditorClass` gap), so the generated body type has
 * `locale: string`/`isActive: boolean`, non-optional. Separately,
 * `variables` is `@ApiPropertyOptional({ type: Object })` — swagger can't
 * infer a real shape from that, so `openapi-typescript` emits
 * `Record<string, never>` (an empty-object-only type, the exact `options`
 * gap) instead of the real `Record<string, unknown>`. Fixed the same way
 * `custom-fields.api.ts` fixes the identical class of gap: local
 * `*RequestBody` interfaces matching the REAL generated shape field-for-field
 * + a targeted `as unknown as {...}` cast at the one call boundary that hits
 * it — the real runtime JSON round-trips correctly either way (every real
 * caller of `createTemplate()` already supplies real `locale`/`isActive`
 * values, per `create-template-dialog.tsx`'s own local state defaults), this
 * is TypeScript-annotation-only, not a runtime bug.
 */
interface CreateTemplateRequestBody {
  eventCode: string;
  channel: CreateTemplateDto["channel"];
  locale: string;
  subject?: string;
  body: string;
  variables?: Record<string, never>;
  isActive: boolean;
}

interface UpdateTemplateRequestBody {
  subject?: string;
  body?: string;
  variables?: Record<string, never>;
  isActive?: boolean;
}

export async function listTemplates(): Promise<TemplateResponseDto[]> {
  return unwrapApiResult<TemplateResponseDto[]>(await apiClient.GET("/api/v1/comms/templates"));
}

export async function getTemplate(id: string): Promise<TemplateResponseDto> {
  return unwrapApiResult<TemplateResponseDto>(await apiClient.GET("/api/v1/comms/templates/{id}", { params: { path: { id } } }));
}

export async function createTemplate(dto: CreateTemplateDto): Promise<TemplateResponseDto> {
  return unwrapApiResult<TemplateResponseDto>(
    await apiClient.POST("/api/v1/comms/templates", { body: dto as unknown as CreateTemplateRequestBody }),
  );
}

/**
 * `eventCode`/`channel`/`locale` are deliberately NOT accepted here —
 * `UpdateTemplateDto` (`packages/server/.../dto/update-template.dto.ts`)
 * only carries `subject`/`body`/`variables`/`isActive`: those three fields
 * form `comm_template`'s own unique triple
 * (`uq_comm_template_event_channel_locale`), immutable after create — the
 * exact same "some fields are create-only" shape `CreateRoleDto
 * .isAuditorClass`/`UpdateRoleDto` already established for Roles (see
 * `create-template-dialog.tsx`'s own doc comment).
 */
export async function updateTemplate(id: string, dto: UpdateTemplateDto): Promise<TemplateResponseDto> {
  return unwrapApiResult<TemplateResponseDto>(
    await apiClient.PATCH("/api/v1/comms/templates/{id}", { params: { path: { id } }, body: dto as unknown as UpdateTemplateRequestBody }),
  );
}

/**
 * `TemplatesController.remove()` returns a real `200` with `{ deleted:
 * true }`, but its `@ApiResponse({ status: 200 })` carries no `type`, so the
 * generated OpenAPI response has no `content` for this operation — typed
 * `void` at this boundary, matching `deleteFeeStructure()`/`deleteClass()`'s
 * own established DELETE-returns-void pattern (`unwrapApiResult` only
 * inspects `response.ok`, not the exact status code, so the 200-vs-204
 * difference from those precedents is harmless).
 */
export async function deleteTemplate(id: string): Promise<void> {
  const result = await apiClient.DELETE("/api/v1/comms/templates/{id}", { params: { path: { id } } });
  unwrapApiResult<void>(result);
}

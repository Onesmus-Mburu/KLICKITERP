import type { CreateTriggerBindingDto, TriggerBindingResponseDto, UpdateTriggerBindingDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `TriggerBindingsController`
 * (`packages/server/src/platform/comms/api/trigger-bindings.controller.ts`)
 * — `comms:trigger-binding:view` covers list/get, `comms:trigger-binding
 * :manage` covers create/update (confirmed by reading the controller
 * directly). No delete route exists — same "no delete path invented" shape
 * every other Comms screen (and most of this codebase) follows, so this
 * file has no `delete*`.
 *
 * **Two real, confirmed codegen gaps on `CreateTriggerBindingDto`
 * specifically** — the exact same TWO classes of gap `templates.api.ts`'s
 * own doc comment documents for `isActive`/`variables`:
 *  1. `isEnabled` is `@ApiPropertyOptional({ default: true })` (genuinely
 *     optional — `@klickit/contracts`' zod-inferred type correctly mirrors
 *     it as `isEnabled?: boolean`), but `@nestjs/swagger` drops the
 *     "optional" signal for this `@ApiPropertyOptional({default})` shape, so
 *     the generated request-body type has `isEnabled: boolean`, non-optional
 *     (confirmed directly against `components["schemas"]["CreateTriggerBindingDto"]`
 *     in `generated/openapi-types.ts`).
 *  2. `audienceRule` is `@ApiPropertyOptional({ type: Object, nullable:
 *     true })` — swagger can't infer a real shape from that, so
 *     `openapi-typescript` emits `Record<string, never> | null` (an
 *     empty-object-only type) instead of the real `Record<string, unknown>`.
 * Fixed the same way `templates.api.ts` fixes the identical class of gap:
 * local `*RequestBody` interfaces matching the REAL generated shape
 * field-for-field + a targeted `as unknown as {...}` cast at the two call
 * boundaries that hit it — the real runtime JSON round-trips correctly
 * either way, this is TypeScript-annotation-only, not a runtime bug.
 * `UpdateTriggerBindingDto` hits gap #2 (`audienceRule`) too — both fields
 * are already correctly optional there (no gap #1), confirmed directly
 * against `components["schemas"]["UpdateTriggerBindingDto"]`.
 */
interface CreateTriggerBindingRequestBody {
  eventCode: string;
  channel: CreateTriggerBindingDto["channel"];
  isEnabled: boolean;
  audienceRule?: Record<string, never>;
}

interface UpdateTriggerBindingRequestBody {
  isEnabled?: boolean;
  audienceRule?: Record<string, never>;
}

export async function createTriggerBinding(dto: CreateTriggerBindingDto): Promise<TriggerBindingResponseDto> {
  return unwrapApiResult<TriggerBindingResponseDto>(
    await apiClient.POST("/api/v1/comms/trigger-bindings", { body: dto as unknown as CreateTriggerBindingRequestBody }),
  );
}

/** `GET /comms/trigger-bindings` is unpaginated (confirmed by reading `TriggerBindingsController.list()` directly), same "small, unbounded dataset" shape `listTemplates()`/`listBroadcasts()` already establish. */
export async function listTriggerBindings(): Promise<TriggerBindingResponseDto[]> {
  return unwrapApiResult<TriggerBindingResponseDto[]>(await apiClient.GET("/api/v1/comms/trigger-bindings"));
}

export async function getTriggerBinding(id: string): Promise<TriggerBindingResponseDto> {
  return unwrapApiResult<TriggerBindingResponseDto>(
    await apiClient.GET("/api/v1/comms/trigger-bindings/{id}", { params: { path: { id } } }),
  );
}

/**
 * `eventCode`/`channel` are deliberately NOT accepted here —
 * `UpdateTriggerBindingDto` (`packages/server/.../dto/update-trigger-
 * binding.dto.ts`) only carries `isEnabled`/`audienceRule`: those two fields
 * form `comm_trigger_binding`'s own unique pair
 * (`event_code`/`channel`), immutable after create — the exact same
 * "some fields are create-only" shape `CreateTemplateDto`'s own
 * `eventCode`/`channel`/`locale` already established for Templates (see
 * `create-trigger-binding-dialog.tsx`'s own doc comment).
 */
export async function updateTriggerBinding(id: string, dto: UpdateTriggerBindingDto): Promise<TriggerBindingResponseDto> {
  return unwrapApiResult<TriggerBindingResponseDto>(
    await apiClient.PATCH("/api/v1/comms/trigger-bindings/{id}", {
      params: { path: { id } },
      body: dto as unknown as UpdateTriggerBindingRequestBody,
    }),
  );
}

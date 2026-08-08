import type { CreateOptoutDto, OptoutResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `OptoutsController`
 * (`packages/server/src/platform/comms/api/optouts.controller.ts`) —
 * `comms:optout:manage` gates all 3 routes (confirmed by reading the
 * controller directly; unlike Templates/TriggerBindings, there's no
 * separate `:view` permission here). `CreateOptoutDto`/`OptoutResponseDto`
 * are real, generated types imported directly from `@klickit/contracts` —
 * unlike `CreateTemplateDto`/`CreateBroadcastDto`/`CreateTriggerBindingDto`,
 * `CreateOptoutDto` has NO codegen gap (confirmed by comparing its generated
 * OpenAPI shape against the real DTO directly: `guardianId`/`channel`/
 * `scope` are all required on both sides, no `@ApiPropertyOptional({default})`
 * field to trip the gap), so no local request-body interface/cast is needed
 * here, unlike those other 3 files.
 *
 * **No "list all opt-outs" route exists** — `GET /comms/optouts` requires
 * `guardianId` (confirmed via `@ApiQuery({ name: "guardianId", required:
 * true })` on `OptoutsController.listByGuardian()`), because there is no
 * guardian/student directory anywhere in this codebase yet (Students
 * module, #8, isn't built) — `guardianId` is a bare, unvalidated uuid with
 * no FK (confirmed in `CreateOptoutDto`'s own `@ApiProperty` description).
 * `listOptoutsByGuardian()` below is therefore the only real read path.
 */
export async function createOptout(dto: CreateOptoutDto): Promise<OptoutResponseDto> {
  return unwrapApiResult<OptoutResponseDto>(await apiClient.POST("/api/v1/comms/optouts", { body: dto }));
}

export async function listOptoutsByGuardian(guardianId: string): Promise<OptoutResponseDto[]> {
  return unwrapApiResult<OptoutResponseDto[]>(
    await apiClient.GET("/api/v1/comms/optouts", { params: { query: { guardianId } } }),
  );
}

/**
 * `OptoutsController.remove()` returns a real `200` with `{ deleted: true
 * }`, but its `@ApiResponse({ status: 200 })` carries no `type`, so the
 * generated OpenAPI response has no `content` for this operation — same
 * "typed `void` at this boundary" shape `templates.api.ts`'s own
 * `deleteTemplate()` already establishes.
 */
export async function deleteOptout(id: string): Promise<void> {
  const result = await apiClient.DELETE("/api/v1/comms/optouts/{id}", { params: { path: { id } } });
  unwrapApiResult<void>(result);
}

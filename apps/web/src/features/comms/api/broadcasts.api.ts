import type { AudienceDefDto, BroadcastResponseDto, CreateBroadcastDto, SubmitBroadcastApprovalDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `BroadcastsController`
 * (`packages/server/src/platform/comms/api/broadcasts.controller.ts`) —
 * `comms:broadcast:view` covers list/get, `comms:broadcast:create` covers
 * create, `comms:broadcast:approve-submit` covers submit-for-approval/
 * approve/cancel, `comms:broadcast:send` covers send (confirmed by reading
 * the controller directly). Response/request types (`BroadcastResponseDto`/
 * `CreateBroadcastDto`/`AudienceDefDto`/`SubmitBroadcastApprovalDto`) are
 * real, generated types imported directly from `@klickit/contracts`, mirroring
 * `features/comms/api/templates.api.ts`'s own shape (Part 1).
 *
 * **A real, confirmed codegen gap on `estCostAmount` specifically** — the
 * same class of gap `templates.api.ts`'s own doc comment documents for
 * `locale`/`isActive`. Server-side, `CreateBroadcastDto.estCostAmount` is
 * `@ApiPropertyOptional({ default: "0" })` (genuinely optional, confirmed by
 * reading `create-broadcast.dto.ts` directly, and `@klickit/contracts`'
 * zod-inferred type correctly mirrors that as `estCostAmount?: string`) —
 * but `@nestjs/swagger` drops the "optional" signal for this
 * `@ApiPropertyOptional({default})` shape, so the generated request-body type
 * (`generated/openapi-types.ts`'s `CreateBroadcastDto`) has
 * `estCostAmount: string`, non-optional. Fixed the same way `templates.api.ts`
 * fixes the identical class of gap: a local `CreateBroadcastRequestBody`
 * interface matching the REAL generated shape field-for-field + a targeted
 * `as unknown as {...}` cast at the one call boundary that hits it — the real
 * runtime JSON round-trips correctly either way, this is
 * TypeScript-annotation-only, not a runtime bug. `audienceDef`'s nested
 * `roleId`/`userIds` are BOTH already correctly optional in the generated
 * type (confirmed directly against `AudienceDefDto`'s own generated schema
 * entry — no gap there), so `AudienceDefDto` is reused as-is, unlike
 * `estCostAmount`.
 */
interface CreateBroadcastRequestBody {
  title: string;
  audienceDef: AudienceDefDto;
  channel: CreateBroadcastDto["channel"];
  body: string;
  // Matches the GENERATED (buggy, non-optional) shape exactly — same
  // deliberate choice `templates.api.ts`'s own `CreateTemplateRequestBody
  // .isActive`/`.locale` make (non-optional there too, for the identical
  // reason): this interface exists to satisfy `apiClient.POST`'s own
  // generated parameter type, not to describe what real callers must
  // supply. The real, optional-at-the-DTO-level omission (this feature's
  // own `create-broadcast-dialog.tsx` genuinely leaves `estCostAmount` out
  // of the object when the admin doesn't type an amount, letting the server
  // default it to "0") passes through fine at runtime — the `as unknown as`
  // cast below bypasses this interface's own missing-property check, so
  // declaring the field required here costs nothing real.
  estCostAmount: string;
}

/** `GET /comms/broadcasts` is unpaginated (confirmed by reading `BroadcastsController.list()` directly), same "small, unbounded dataset" shape `listTemplates()` already established. */
export async function listBroadcasts(): Promise<BroadcastResponseDto[]> {
  return unwrapApiResult<BroadcastResponseDto[]>(await apiClient.GET("/api/v1/comms/broadcasts"));
}

export async function getBroadcast(id: string): Promise<BroadcastResponseDto> {
  return unwrapApiResult<BroadcastResponseDto>(
    await apiClient.GET("/api/v1/comms/broadcasts/{id}", { params: { path: { id } } }),
  );
}

export async function createBroadcast(dto: CreateBroadcastDto): Promise<BroadcastResponseDto> {
  return unwrapApiResult<BroadcastResponseDto>(
    await apiClient.POST("/api/v1/comms/broadcasts", { body: dto as unknown as CreateBroadcastRequestBody }),
  );
}

/**
 * `DRAFT -> PENDING_APPROVAL`. `dto.approvalRef` is generated client-side via
 * `crypto.randomUUID()` by the ONE real caller (`broadcast-actions.tsx`) —
 * see that file's own doc comment for why: the real appr_* approval workflow
 * engine is Module 6 (Approvals), not built yet, so this endpoint "does not
 * validate or resolve the reference against anything" (the controller's own
 * doc comment) — any uuid is accepted, this wrapper itself is just a plain
 * pass-through of whatever caller-supplied `SubmitBroadcastApprovalDto` it
 * receives, same as every other function in this file.
 */
export async function submitForApproval(id: string, dto: SubmitBroadcastApprovalDto): Promise<BroadcastResponseDto> {
  return unwrapApiResult<BroadcastResponseDto>(
    await apiClient.POST("/api/v1/comms/broadcasts/{id}/submit-for-approval", { params: { path: { id } }, body: dto }),
  );
}

/** `PENDING_APPROVAL -> APPROVED`. No request body, mirroring `themes.api.ts`'s `publishTheme()`'s identical no-body `POST .../:id/{action}` shape. */
export async function approveBroadcast(id: string): Promise<BroadcastResponseDto> {
  return unwrapApiResult<BroadcastResponseDto>(
    await apiClient.POST("/api/v1/comms/broadcasts/{id}/approve", { params: { path: { id } } }),
  );
}

/** Any pre-SENDING state -> CANCELLED. No request body. */
export async function cancelBroadcast(id: string): Promise<BroadcastResponseDto> {
  return unwrapApiResult<BroadcastResponseDto>(
    await apiClient.POST("/api/v1/comms/broadcasts/{id}/cancel", { params: { path: { id } } }),
  );
}

/** `APPROVED -> SENDING -> SENT` — resolves the audience and fans out one real `comm_message` per recipient. No request body. The one genuinely irreversible action in the whole broadcast lifecycle (see `broadcast-actions.tsx`'s own confirm-dialog reasoning). */
export async function sendBroadcast(id: string): Promise<BroadcastResponseDto> {
  return unwrapApiResult<BroadcastResponseDto>(
    await apiClient.POST("/api/v1/comms/broadcasts/{id}/send", { params: { path: { id } } }),
  );
}

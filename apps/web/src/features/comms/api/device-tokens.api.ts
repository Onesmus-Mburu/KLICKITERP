import type { DeviceTokenResponseDto, RegisterDeviceTokenDto, UnregisterDeviceTokenDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `DeviceTokensController`
 * (`packages/server/src/platform/comms/api/device-tokens.controller.ts`) —
 * genuinely self-service, no `@RequirePermission` anywhere (only JWT
 * authentication; `userId` always comes from the token's `sub` claim, never
 * the request body — mirrors `AuthController`'s own self-service endpoints
 * like `password/change`, confirmed by reading the controller directly).
 *
 * `RegisterDeviceTokenDto`/`UnregisterDeviceTokenDto`/`DeviceTokenResponseDto`
 * are real, generated types imported directly from `@klickit/contracts` —
 * neither request DTO has a codegen gap (confirmed by comparing their
 * generated OpenAPI shape against the real DTOs directly: `token`/`platform`
 * on `RegisterDeviceTokenDto` and `token` on `UnregisterDeviceTokenDto` are
 * both required on both sides — no `@ApiPropertyOptional({default})` field
 * to trip the swagger-drops-optional gap Parts 1–3 documented elsewhere in
 * this feature), so no local request-body interface/cast is needed here,
 * same as `optouts.api.ts`'s own `createOptout()`.
 *
 * `DELETE /comms/device-tokens` is keyed by the token VALUE in the request
 * body, not an id in the URL (confirmed by reading the controller directly)
 * — `unregisterDeviceToken()` below reflects that shape exactly.
 */
export async function registerDeviceToken(dto: RegisterDeviceTokenDto): Promise<DeviceTokenResponseDto> {
  return unwrapApiResult<DeviceTokenResponseDto>(await apiClient.POST("/api/v1/comms/device-tokens", { body: dto }));
}

export async function listMyDeviceTokens(): Promise<DeviceTokenResponseDto[]> {
  return unwrapApiResult<DeviceTokenResponseDto[]>(await apiClient.GET("/api/v1/comms/device-tokens"));
}

/**
 * `DeviceTokensController.unregister()` returns a real `200` with `{
 * deleted: true }`, but its `@ApiResponse({ status: 200 })` carries no
 * `type`, so the generated OpenAPI response has no `content` for this
 * operation — same typed-`void`-at-this-boundary shape
 * `deleteTemplate()`/`deleteOptout()` already establish.
 */
export async function unregisterDeviceToken(dto: UnregisterDeviceTokenDto): Promise<void> {
  const result = await apiClient.DELETE("/api/v1/comms/device-tokens", { body: dto });
  unwrapApiResult<void>(result);
}

/**
 * A masked preview of a token value for display — the real `DELETE` body
 * still carries the full value (see `unregisterDeviceToken()` above); this
 * is presentation-only. Showing the full up-to-300-char raw token would be
 * visually unwieldy in a table row or a confirm dialog, so only the first 6
 * and last 4 characters are shown for tokens long enough for that to still
 * read as a genuine preview — shorter tokens (e.g. a hand-typed test value)
 * are shown in full, since masking a short string would hide more than it
 * reveals.
 */
const MASK_MIN_LENGTH = 14;
export function maskDeviceToken(token: string): string {
  if (token.length <= MASK_MIN_LENGTH) return token;
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

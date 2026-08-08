import { SetMetadata } from "@nestjs/common";

export const PERMISSION_METADATA_KEY = "permission";

/**
 * Marks a handler/controller as requiring the given permission code
 * (docs/phase-3/02-communication-authentication.md §2.3 `PermissionsGuard`).
 * The guard that reads this metadata is built in the next pass, once
 * usr_permission exists to validate codes against.
 */
export const RequirePermission = (code: string): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSION_METADATA_KEY, code);

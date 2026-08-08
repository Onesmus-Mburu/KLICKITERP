import { SetMetadata } from "@nestjs/common";

export const IS_EXEMPT_FROM_LICENSE_GUARD_METADATA_KEY = "isExemptFromLicenseGuard";

/**
 * Opts an endpoint out of `LicenseStateGuard` (shared/rbac/license-state.guard.ts)
 * — mirrors `platform/auth`'s `@Public()` decorator exactly (same
 * `SetMetadata` shape, same class+method applicability). Per FR-LIC-006.1 /
 * BR-LIC-01 ("license checks never block reads, exports, or backups in any
 * state"), applied to: `platform/auth`'s login/2FA-verify/refresh/logout/OTP
 * endpoints (a DEACTIVATED instance must still let a System Admin
 * authenticate), `domains/reporting`'s export-job endpoints, and
 * `domains/backups-ops`'s backup/restore endpoints — see each controller's
 * own doc comment at the call site for the specific handlers.
 */
export const ExemptFromLicenseGuard = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_EXEMPT_FROM_LICENSE_GUARD_METADATA_KEY, true);

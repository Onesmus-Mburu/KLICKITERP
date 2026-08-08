import { DomainException } from "./domain-exception";

/**
 * FR-LIC-006.1 — thrown by `LicenseStateGuard` (shared/rbac) when the
 * cached `license.v_state` row reads `SUSPENDED` and the inbound request is
 * a non-GET mutation on an endpoint not marked `@ExemptFromLicenseGuard()`.
 * A distinct `DomainException` subclass (rather than reusing
 * `AuthorizationException`'s fixed `"FORBIDDEN"` code) so the top-level
 * `error.code` in the API envelope is literally `LICENSE_SUSPENDED`, per
 * FR-LIC-006.1's own wording ("return 403 LICENSE_SUSPENDED").
 */
export class LicenseSuspendedException extends DomainException {
  readonly code = "LICENSE_SUSPENDED";
  readonly httpStatus = 403;

  constructor(details?: unknown) {
    super("The license is SUSPENDED — mutating endpoints are blocked (reads, exports, and backups remain available)", details);
  }
}

/**
 * FR-LIC-006.1's other enforcement branch — `DEACTIVATED` restricts every
 * endpoint except auth (to let a System Admin log in) and export/backup
 * screens. Same "own `code` string" reasoning as `LicenseSuspendedException`
 * above.
 */
export class LicenseDeactivatedException extends DomainException {
  readonly code = "LICENSE_DEACTIVATED";
  readonly httpStatus = 403;

  constructor(details?: unknown) {
    super(
      "The license is DEACTIVATED — only authentication and System Admin export/backup screens remain available",
      details,
    );
  }
}

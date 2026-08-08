/**
 * Shape `JwtAuthGuard` (platform/auth) attaches to `req.user`. Declared
 * locally rather than imported from `platform/auth` — mirrors every other
 * domain/platform module's own `api/request-context.ts` (accounting,
 * `domains/billing`, `platform/comms`, `platform/settings`,
 * `platform/branding`, `platform/approvals`) even though `domains/payments`'
 * `mayImport` (module-deps.json) now DOES include `platform/auth` (for
 * `@Public()` on the M-Pesa callback endpoints) — kept structurally typed
 * here too, for consistency with the rest of the codebase and so this file
 * never needs to change if `platform/auth`'s own `RequestUser` shape is
 * refactored.
 */
export interface AuthenticatedRequest {
  user?: {
    sub: string;
    sid: string;
    roles: string[];
    permsHash: string;
  };
}

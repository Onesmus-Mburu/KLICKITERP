/**
 * Shape `JwtAuthGuard` (platform/auth) attaches to `req.user`. Declared
 * locally rather than imported from `platform/auth` — `domains/billing`'s
 * `mayImport` (module-deps.json) does not include `platform/auth`, so this is
 * a structurally-typed duplicate of the guard's output shape, not a
 * cross-module import. Mirrors `accounting`/`platform/comms`/`platform/settings`/
 * `platform/branding`/`platform/approvals`'s own `api/request-context.ts`.
 */
export interface AuthenticatedRequest {
  user?: {
    sub: string;
    sid: string;
    roles: string[];
    permsHash: string;
  };
}

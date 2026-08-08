/**
 * Shape `JwtAuthGuard` (platform/auth) attaches to `req.user`. Declared
 * locally rather than imported from `platform/auth` — `accounting`'s
 * `mayImport` is `["shared", "platform/settings", "platform/approvals"]`
 * (module-deps.json), so this is a structurally-typed duplicate of the
 * guard's output shape, not a cross-module import. Mirrors
 * `platform/comms`/`platform/settings`/`platform/branding`/`platform/approvals`'
 * `api/request-context.ts`.
 */
export interface AuthenticatedRequest {
  user?: {
    sub: string;
    sid: string;
    roles: string[];
    permsHash: string;
  };
}

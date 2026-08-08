/**
 * Shape `JwtAuthGuard` (platform/auth) attaches to `req.user`. Declared
 * locally rather than imported from `platform/auth` — `platform/comms`'
 * `mayImport` is `["shared", "platform/users", "platform/settings"]`
 * (module-deps.json), so this is a structurally-typed duplicate of the
 * guard's output shape, not a cross-module import. Mirrors
 * `platform/files`/`platform/settings`/`platform/branding`'s
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

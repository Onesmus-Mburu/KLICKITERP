/**
 * Shape `JwtAuthGuard` (platform/auth) attaches to `req.user`. Declared
 * locally rather than imported from `platform/auth` — `platform/settings`'s
 * `mayImport` is `["shared"]` only (module-deps.json), the default
 * platform-module boundary — so this is a structurally-typed duplicate of
 * the guard's output shape, not a cross-module import. Mirrors
 * `platform/users/api/request-context.ts`.
 */
export interface AuthenticatedRequest {
  user?: {
    sub: string;
    sid: string;
    roles: string[];
    permsHash: string;
  };
}

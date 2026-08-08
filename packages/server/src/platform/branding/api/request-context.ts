/**
 * Shape `JwtAuthGuard` (platform/auth) attaches to `req.user`. Declared
 * locally rather than imported from `platform/auth` — `platform/branding`'s
 * `mayImport` is `["shared", "platform/files"]` (module-deps.json), so this
 * is a structurally-typed duplicate of the guard's output shape, not a
 * cross-module import. Mirrors `platform/files/api/request-context.ts` and
 * `platform/settings/api/request-context.ts`.
 */
export interface AuthenticatedRequest {
  user?: {
    sub: string;
    sid: string;
    roles: string[];
    permsHash: string;
  };
}

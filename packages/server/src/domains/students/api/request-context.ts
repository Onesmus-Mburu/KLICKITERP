/**
 * Shape `JwtAuthGuard` (platform/auth) attaches to `req.user`. Declared
 * locally rather than imported from `platform/auth` — `domains/students`'
 * `mayImport` is `["shared", "accounting", "platform/settings",
 * "platform/files", "platform/users"]` (module-deps.json), so this is a
 * structurally-typed duplicate of the guard's output shape, not a
 * cross-module import. Mirrors every other module's `api/request-context.ts`.
 */
export interface AuthenticatedRequest {
  user?: {
    sub: string;
    sid: string;
    roles: string[];
    permsHash: string;
  };
}

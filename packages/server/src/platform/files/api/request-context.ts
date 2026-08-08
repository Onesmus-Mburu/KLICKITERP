/**
 * Shape `JwtAuthGuard` (platform/auth) attaches to `req.user`. Declared
 * locally rather than imported from `platform/auth` — `platform/files`'s
 * `mayImport` is `["shared", "platform/users"]` (module-deps.json; the
 * `platform/users` grant is only for `UsrUserEntity`, the `uploaded_by` FK
 * target — not for `platform/auth`) — so this is a structurally-typed
 * duplicate of the guard's output shape, not a cross-module import. Mirrors
 * `platform/settings/api/request-context.ts` and `platform/users/api/request-context.ts`.
 */
export interface AuthenticatedRequest {
  user?: {
    sub: string;
    sid: string;
    roles: string[];
    permsHash: string;
  };
}

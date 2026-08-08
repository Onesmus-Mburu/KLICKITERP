/**
 * Shape `JwtAuthGuard` (platform/auth) attaches to `req.user`. Declared
 * locally rather than imported from `platform/auth` — `platform/users`'s
 * `mayImport` is `["shared"]` only (module-deps.json), a narrower,
 * intentionally one-directional boundary than auth's (auth -> users, never
 * the reverse) — so this is a structurally-typed duplicate of the guard's
 * output shape, not a cross-module import.
 */
export interface AuthenticatedRequest {
  user?: {
    sub: string;
    sid: string;
    roles: string[];
    permsHash: string;
  };
}

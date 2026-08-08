/**
 * Shape `JwtAuthGuard` (platform/auth) attaches to `req.user`. Declared
 * locally rather than imported from `platform/auth` — mirrors every other
 * domain/platform module's own `api/request-context.ts` (accounting,
 * `domains/billing`, `domains/payments`, `domains/inventory`, etc.).
 */
export interface AuthenticatedRequest {
  user?: {
    sub: string;
    sid: string;
    roles: string[];
    permsHash: string;
  };
}

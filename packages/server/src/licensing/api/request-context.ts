import { VerifiedInboundRequest } from "../infrastructure/crypto/jws-mutual-auth";

/** Attached by `LicenseMutualAuthGuard` — `license-api.controller.ts`'s request shape. */
export interface LicenseMutualAuthRequest {
  licenseAuth?: VerifiedInboundRequest;
}

/**
 * Shape the normal `JwtAuthGuard` (platform/auth) attaches to `req.user` —
 * declared locally rather than imported from `platform/auth`, mirroring
 * every other module's own `api/request-context.ts` (e.g.
 * `domains/backups-ops/api/request-context.ts`) AND, for `licensing`
 * specifically, structurally required: `licensing` may import `shared`
 * only (module-deps.json), so it could never import this type from
 * `platform/auth` even if it wanted to. `license-status.controller.ts`
 * (the staff-facing surface) uses this shape.
 */
export interface StaffAuthenticatedRequest {
  user?: {
    sub: string;
    sid: string;
    roles: string[];
    permsHash: string;
  };
}

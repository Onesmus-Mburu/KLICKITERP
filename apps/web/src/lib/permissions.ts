import { jwtDecode } from "jwt-decode";

/**
 * FLAGGED DECISION #1 (docs/phase-6/PROGRESS.md): the real access-JWT claims
 * (`packages/server/.../jwt-token.service.ts`'s `AccessTokenClaims`) are
 * `{ sub, sid, roles: string[], perms_hash, typ }` — role NAMES only, plus
 * an opaque hash the backend resolves server-side. No endpoint anywhere in
 * this codebase returns the caller's own permission-CODE list (confirmed by
 * grep before writing this file), so there is no way to build real
 * fine-grained permission gating on the client at all.
 *
 * Two deliberately different gating mechanisms, for two deliberately
 * different jobs:
 *  1. THIS file — coarse, decode-only ROLE-NAME gating, used ONLY to decide
 *     which nav items to render (hiding a link a user can't use is a UX
 *     nicety, not a security boundary — the route itself is still
 *     protected server-side regardless of what the sidebar shows).
 *  2. `<QueryBoundary>` — REAL permission enforcement, driven by an actual
 *     403 the server returns for the specific endpoint being called. This
 *     is the one that matters: it reflects the server's actual RBAC
 *     decision, not a client-side guess a stale/decoded JWT can never
 *     fully replicate (`perms_hash` isn't a list this app can expand).
 *
 * A future backend addition (a real `GET /auth/session` permission-list
 * endpoint) would let nav gating become accurate too — flagged in
 * docs/phase-6/PROGRESS.md as a good follow-up, deliberately NOT built in
 * this frontend-only slice.
 */
interface DecodedAccessToken {
  sub: string;
  sid: string;
  roles: string[];
  perms_hash: string;
  typ: string;
  exp?: number;
}

export function decodeRoles(accessToken: string | null): string[] {
  if (!accessToken) return [];
  try {
    const decoded = jwtDecode<DecodedAccessToken>(accessToken);
    return decoded.roles ?? [];
  } catch {
    return [];
  }
}

export function hasAnyRole(accessToken: string | null, allowedRoles: readonly string[]): boolean {
  if (allowedRoles.length === 0) return true;
  const roles = decodeRoles(accessToken);
  return roles.some((role) => allowedRoles.includes(role));
}

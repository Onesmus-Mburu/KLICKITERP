import { RequestUser } from "../../../platform/auth";

/**
 * Minimal request shape controllers need — same convention every other
 * domain module's own `api/request-context.ts` establishes (e.g.
 * `domains/billing/api/request-context.ts`), duplicated per module rather
 * than imported from a shared location (there is no shared one — each
 * domain module owns its own thin copy).
 */
export interface AuthenticatedRequest {
  user?: RequestUser;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

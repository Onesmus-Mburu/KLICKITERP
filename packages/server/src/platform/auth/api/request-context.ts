import { RequestUser } from "../infrastructure/guards/jwt-auth.guard";

/**
 * Minimal request shape controllers need (mirrors the `MinimalRequest`
 * pattern in `shared/exceptions/all-exceptions.filter.ts` — works against
 * both Express and Fastify adapters, whichever `apps/api` ends up using).
 */
export interface AuthenticatedRequest {
  user?: RequestUser;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

export function extractIp(req: AuthenticatedRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip ?? req.socket?.remoteAddress ?? "0.0.0.0";
}

export function extractUserAgent(req: AuthenticatedRequest): string {
  const ua = req.headers["user-agent"];
  if (Array.isArray(ua)) return ua[0] ?? "unknown";
  return ua ?? "unknown";
}

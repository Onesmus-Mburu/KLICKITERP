import type { Redis } from "ioredis";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { RedisKeys } from "../infrastructure/redis-keys";
import { RequestUser } from "../infrastructure/guards/jwt-auth.guard";

/**
 * Resolves the caller's full granted-permission-code set — the exact same
 * resolution `PermissionsGuard` (`infrastructure/guards/permissions.guard.ts`)
 * performs for a STATIC `@RequirePermission(code)` route: API-key auth
 * short-circuits to `apiKeyScopes`; ordinary JWT auth reads the Redis cache
 * keyed by `perms_hash` (populated at login/refresh by `AuthService`), same
 * cache-miss-means-stale-token 401 as the guard.
 *
 * Exported specifically for callers that cannot express their required
 * permission as compile-time route metadata — `PermissionsGuard` only reads
 * ONE static code per handler via `@RequirePermission`, which cannot express
 * "the permission code depends on a route param" (e.g. Module 18 Reporting's
 * `POST /reports/:code/execute`, whose gating permission is
 * `report.permissionCode`, looked up from the report registry at request
 * time). Such a route omits `@RequirePermission` entirely (so the global
 * `PermissionsGuard` no-ops for it — see that guard's own `if
 * (!requiredPermission) return true` branch) and instead calls this helper
 * directly inside the handler to perform the identical check by hand. Kept
 * here (not duplicated at each call site) so the Redis key format/cache-miss
 * semantics stay centralized in one place should they ever change.
 */
export async function resolveGrantedPermissions(user: RequestUser, redis: Redis): Promise<string[]> {
  if (user.apiKeyScopes) {
    return user.apiKeyScopes;
  }
  const cached = await redis.get(RedisKeys.permsCache(user.permsHash));
  if (cached === null) {
    throw new AuthenticationException("Permission set expired — refresh required");
  }
  return JSON.parse(cached) as string[];
}

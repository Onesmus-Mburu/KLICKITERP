import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Redis } from "ioredis";
import { REDIS_CLIENT } from "../../../../shared/cache/redis.provider";
import { AuthenticationException } from "../../../../shared/exceptions/authentication.exception";
import { AuthorizationException } from "../../../../shared/exceptions/authorization.exception";
import { PERMISSION_METADATA_KEY } from "../../../../shared/rbac/require-permission.decorator";
import { RedisKeys } from "../redis-keys";
import { RequestUser } from "./jwt-auth.guard";

interface MinimalHttpRequest {
  user?: RequestUser;
}

/**
 * Second guard in the pipeline (§2.3): reads `@RequirePermission` and checks
 * it against the Redis-cached permission set for the session, keyed by
 * `perms_hash` (populated at login/refresh by `AuthService`). A cache miss
 * means the client is holding a JWT whose permission snapshot Redis no
 * longer has (evicted, or role changed since — `perms_hash` mismatch) —
 * per §2.3 the response is a 401 asking the client to refresh, not a 403,
 * since the client's own token may simply be stale.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest<MinimalHttpRequest>();
    const user = request.user;
    if (!user) {
      throw new AuthenticationException("Authentication required");
    }

    if (user.apiKeyScopes) {
      if (!user.apiKeyScopes.includes(requiredPermission)) {
        throw new AuthorizationException(`API key is not scoped for "${requiredPermission}"`);
      }
      return true;
    }

    const cached = await this.redis.get(RedisKeys.permsCache(user.permsHash));
    if (cached === null) {
      throw new AuthenticationException("Permission set expired — refresh required");
    }

    const grantedCodes: string[] = JSON.parse(cached);
    if (!grantedCodes.includes(requiredPermission)) {
      throw new AuthorizationException(`Missing required permission "${requiredPermission}"`);
    }
    return true;
  }
}

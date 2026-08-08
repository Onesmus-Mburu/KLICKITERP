import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createHash } from "node:crypto";
import type { Redis } from "ioredis";
import { REDIS_CLIENT } from "../../../../shared/cache/redis.provider";
import { AuthenticationException } from "../../../../shared/exceptions/authentication.exception";
import { AppConfigService } from "../../../../shared/config/app-config.service";
import { JwtTokenService } from "../jwt-token.service";
import { UsrApiKeyRepository } from "../usr-api-key.repository";
import { RedisKeys } from "../redis-keys";
import { IS_PUBLIC_METADATA_KEY } from "./public.decorator";

export interface RequestUser {
  sub: string;
  sid: string;
  roles: string[];
  permsHash: string;
  /** Present only for API-key auth — a scoped permission set replaces role resolution (FR-API-003). */
  apiKeyScopes?: string[];
}

interface MinimalHttpRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: RequestUser;
}

/**
 * First guard in the pipeline (docs/phase-3/02-communication-authentication.md
 * §2.3): verifies JWT signature/expiry + Redis `sid` revocation tombstone
 * for bearer JWTs, OR resolves a `kfe_live_...` API key to a scoped
 * permission set (§2.4) — both paths attach `req.user`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtTokenService: JwtTokenService,
    private readonly apiKeyRepository: UsrApiKeyRepository,
    private readonly config: AppConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<MinimalHttpRequest>();
    const authHeader = request.headers.authorization;
    const token = extractBearerToken(authHeader);
    if (!token) {
      throw new AuthenticationException("Missing bearer token");
    }

    if (token.startsWith(this.config.apiKeyPrefix)) {
      request.user = await this.resolveApiKey(token);
      return true;
    }

    const claims = this.jwtTokenService.verify(token);
    const revoked = await this.redis.get(RedisKeys.sessionRevoked(claims.sid));
    if (revoked) {
      throw new AuthenticationException("Session has been revoked");
    }

    request.user = {
      sub: claims.sub,
      sid: claims.sid,
      roles: claims.roles,
      permsHash: claims.perms_hash,
    };
    return true;
  }

  private async resolveApiKey(rawKey: string): Promise<RequestUser> {
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    const cached = await this.redis.get(RedisKeys.apiKeyCache(keyHash));
    if (cached === "revoked") {
      throw new AuthenticationException("API key has been revoked");
    }

    const record = await this.apiKeyRepository.findByHash(keyHash);
    if (!record) {
      throw new AuthenticationException("Invalid API key");
    }
    if (record.revokedAt) {
      await this.redis.set(RedisKeys.apiKeyCache(keyHash), "revoked", "EX", 60);
      throw new AuthenticationException("API key has been revoked");
    }
    if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
      throw new AuthenticationException("API key has expired");
    }

    await this.apiKeyRepository.touchLastUsed(record.id);

    return {
      sub: record.ownerUserId,
      sid: `apikey:${record.id}`,
      roles: [],
      permsHash: "",
      apiKeyScopes: record.scopes,
    };
  }
}

function extractBearerToken(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || !value.startsWith("Bearer ")) {
    return null;
  }
  return value.slice("Bearer ".length).trim();
}

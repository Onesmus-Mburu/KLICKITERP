import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { Redis } from "ioredis";
import { REDIS_CLIENT } from "../../../shared/cache/redis.provider";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { AuthorizationException } from "../../../shared/exceptions/authorization.exception";
import { UsrApiKeyRepository } from "../infrastructure/usr-api-key.repository";
import { RedisKeys } from "../infrastructure/redis-keys";

const SECRET_RANDOM_CHARS = 26;
const BASE62_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export interface CreateApiKeyResult {
  id: string;
  name: string;
  /** Returned once — never retrievable again (only the SHA-256 hash is stored). */
  secret: string;
  prefix: string;
  scopes: string[];
  expiresAt: Date | null;
}

export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  expiresAt: Date | null;
  ipAllowlist: string[] | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  ownerUserId: string;
  createdAt: Date;
}

/** FR-API-003 — `kfe_live_<26 chars>` key management. */
@Injectable()
export class ApiKeyService {
  constructor(
    private readonly apiKeyRepository: UsrApiKeyRepository,
    private readonly config: AppConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async create(
    ownerUserId: string,
    name: string,
    scopes: string[],
    expiresAt: Date | null,
    ipAllowlist: string[] | null,
  ): Promise<CreateApiKeyResult> {
    const secret = `${this.config.apiKeyPrefix}${randomBase62(SECRET_RANDOM_CHARS)}`;
    const keyHash = createHash("sha256").update(secret).digest("hex");
    const prefix = secret.slice(0, 12);

    const record = await this.apiKeyRepository.create({
      name,
      keyHash,
      prefix,
      scopes,
      expiresAt,
      ipAllowlist,
      ownerUserId,
    });

    return {
      id: record.id,
      name: record.name,
      secret,
      prefix: record.prefix,
      scopes: record.scopes,
      expiresAt: record.expiresAt,
    };
  }

  async list(ownerUserId: string): Promise<ApiKeySummary[]> {
    const records = await this.apiKeyRepository.listForOwner(ownerUserId);
    return records.map((record) => ({
      id: record.id,
      name: record.name,
      prefix: record.prefix,
      scopes: record.scopes,
      expiresAt: record.expiresAt,
      ipAllowlist: record.ipAllowlist,
      lastUsedAt: record.lastUsedAt,
      revokedAt: record.revokedAt,
      ownerUserId: record.ownerUserId,
      createdAt: record.createdAt,
    }));
  }

  /** Revocation is immediate — busts the Redis cache `JwtAuthGuard` reads (§2.4). */
  async revoke(id: string, ownerUserId: string): Promise<void> {
    const record = await this.apiKeyRepository.findById(id);
    if (!record) {
      throw new NotFoundException("API key", id);
    }
    if (record.ownerUserId !== ownerUserId) {
      throw new AuthorizationException("Cannot revoke another user's API key");
    }
    record.revokedAt = new Date();
    await this.apiKeyRepository.save(record);
    await this.redis.set(RedisKeys.apiKeyCache(record.keyHash), "revoked", "EX", 60);
  }
}

function randomBase62(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += BASE62_ALPHABET[bytes[i] % BASE62_ALPHABET.length];
  }
  return out;
}

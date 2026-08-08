import { Inject, Injectable } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS_CLIENT } from "../../../shared/cache/redis.provider";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { RedisKeys } from "../infrastructure/redis-keys";
import { AuthAuditLogRepository } from "../infrastructure/audit-log.repository";

/**
 * FR-AUTH-007.1 — 5 fails/15 min window -> 15 min lock (both configurable).
 * Keyed by login identifier (username/email/phone as presented), not by
 * user id, so lockout also throttles enumeration attempts against
 * usernames that don't resolve to a real account.
 */
@Injectable()
export class LockoutService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: AppConfigService,
    private readonly auditLogRepository: AuthAuditLogRepository,
  ) {}

  async isLocked(identifier: string): Promise<boolean> {
    const locked = await this.redis.get(RedisKeys.lockoutLocked(identifier));
    return locked !== null;
  }

  /** Returns true if this failure just tripped the lock. */
  async registerFailure(identifier: string): Promise<boolean> {
    const key = RedisKeys.lockoutFailures(identifier);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, this.config.lockoutWindowMinutes * 60);
    }
    if (count >= this.config.lockoutMaxFailures) {
      await this.redis.set(RedisKeys.lockoutLocked(identifier), "1", "EX", this.config.lockoutDurationMinutes * 60);
      return true;
    }
    return false;
  }

  async reset(identifier: string): Promise<void> {
    await this.redis.del(RedisKeys.lockoutFailures(identifier), RedisKeys.lockoutLocked(identifier));
  }

  /**
   * System Admin unlock — writes an audit entry (FR-AUTH-007.1). `targetUserId`
   * (a real `usr_user.id`) is the audit `entity_id` (uuid column); `identifier`
   * is whatever the lockout counters were keyed by (username/email/phone as
   * originally presented at login) and travels in the audit payload for context.
   */
  async unlock(targetUserId: string, identifier: string, adminUserId: string): Promise<void> {
    await this.reset(identifier);
    await this.auditLogRepository.append({
      actorId: adminUserId,
      actorLabel: "system_admin",
      entityType: "usr_user_lockout",
      entityId: targetUserId,
      action: "UNLOCK",
      before: { locked: true, identifier },
      after: { locked: false, identifier },
    });
  }
}

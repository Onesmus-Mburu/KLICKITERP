import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { createHash, randomBytes, randomInt } from "node:crypto";
import type { Redis } from "ioredis";
import { DataSource } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { REDIS_CLIENT } from "../../../shared/cache/redis.provider";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { OutboxWriterService } from "../../../shared/events/outbox-writer.service";
import { AuthUsrUserRepository } from "../infrastructure/usr-user.repository";
import { UsrSessionRepository } from "../infrastructure/usr-session.repository";
import { JwtTokenService } from "../infrastructure/jwt-token.service";
import { RedisKeys } from "../infrastructure/redis-keys";
import { NotificationPort, NOTIFICATION_PORT } from "../infrastructure/notification-port";
import { hashPermissionSet } from "../infrastructure/permission-resolution.repository";
import { LoginSucceededEvent } from "../events/login-succeeded.event";

interface OtpRecord {
  hash: string;
  attempts: number;
}

export interface OtpVerifyResult {
  accessToken: string;
  refreshToken: string;
  /** BR-SEC-03 — resolved server-side; empty until the students module (Module 8) lands (see task note). */
  linkedStudents: unknown[];
}

/** FR-AUTH-013.1 — parent OTP login (§2.2). */
@Injectable()
export class OtpService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly userRepository: AuthUsrUserRepository,
    private readonly sessionRepository: UsrSessionRepository,
    private readonly jwtTokenService: JwtTokenService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly config: AppConfigService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async requestOtp(phone: string, ip: string): Promise<{ sent: true }> {
    await this.enforceRateLimit(RedisKeys.otpSendCountPhone(phone), this.config.otpMaxSendsPerHourPerPhone);
    await this.enforceRateLimit(RedisKeys.otpSendCountIp(ip), this.config.otpMaxSendsPerHourPerIp);

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const record: OtpRecord = { hash: hashCode(code), attempts: 0 };
    await this.redis.set(RedisKeys.otpCode(phone), JSON.stringify(record), "EX", this.config.otpTtlSeconds);

    await this.notifications.send({
      to: phone,
      channel: "SMS",
      body: `Your Klickit verification code is ${code}. It expires in ${Math.round(this.config.otpTtlSeconds / 60)} minutes.`,
    });

    return { sent: true };
  }

  async verifyOtp(phone: string, code: string, ip: string, userAgent: string): Promise<OtpVerifyResult> {
    const key = RedisKeys.otpCode(phone);
    const raw = await this.redis.get(key);
    if (!raw) {
      throw new AuthenticationException("OTP expired or was never requested");
    }
    const record = JSON.parse(raw) as OtpRecord;

    if (record.attempts >= this.config.otpMaxVerifyAttempts) {
      await this.redis.del(key);
      throw new AuthenticationException("Too many attempts — request a new code");
    }

    if (record.hash !== hashCode(code)) {
      record.attempts += 1;
      await this.redis.set(key, JSON.stringify(record), "KEEPTTL");
      throw new AuthenticationException("Invalid code");
    }

    await this.redis.del(key);

    const user = await this.userRepository.findByPhoneAndType(phone, "PARENT");
    if (!user) {
      throw new NotFoundException("Parent account", phone);
    }

    return runInTransaction(this.dataSource, async (manager) => {
      const familyId = generateUuidV7();
      const refreshToken = randomBytes(32).toString("hex"); // 256-bit opaque token
      const session = await this.sessionRepository.create(
        {
          userId: user.id,
          familyId,
          refreshTokenHash: hashCode(refreshToken),
          device: userAgent.slice(0, 160),
          ip,
          userAgent,
          lastSeenAt: new Date(),
        },
        manager,
      );

      // No usr_role rows are attached to parent OTP sessions in Module 1 — the
      // portal's permission surface is scoped by `typ:"parent"` rather than
      // the RBAC role/permission tables (parents hold no usr_permission grants).
      const accessToken = this.jwtTokenService.sign({
        sub: user.id,
        sid: session.id,
        roles: ["PARENT"],
        perms_hash: hashPermissionSet([]),
        typ: "parent",
      });

      await this.userRepository.touchLastLogin(user.id, manager);
      await this.outboxWriter.write(
        manager,
        new LoginSucceededEvent(user.id, { sessionId: session.id, ip, userAgent }),
      );

      return { accessToken, refreshToken, linkedStudents: [] };
    });
  }

  private async enforceRateLimit(key: string, max: number): Promise<void> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, 60 * 60);
    }
    if (count > max) {
      throw new AuthenticationException("Rate limit exceeded — try again later");
    }
  }
}

function hashCode(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import * as bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import type { Redis } from "ioredis";
import { DataSource } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { REDIS_CLIENT } from "../../../shared/cache/redis.provider";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { AuthUsrUserRepository } from "../infrastructure/usr-user.repository";
import { UsrPasswordHistoryRepository } from "../infrastructure/usr-password-history.repository";
import { UsrSessionRepository } from "../infrastructure/usr-session.repository";
import { RedisKeys } from "../infrastructure/redis-keys";
import { NotificationPort, NOTIFICATION_PORT } from "../infrastructure/notification-port";

const BCRYPT_ROUNDS = 12;

@Injectable()
export class PasswordService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly userRepository: AuthUsrUserRepository,
    private readonly passwordHistoryRepository: UsrPasswordHistoryRepository,
    private readonly sessionRepository: UsrSessionRepository,
    private readonly config: AppConfigService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AuthenticationException("Unknown user");
    }
    const currentOk = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!currentOk) {
      throw new AuthenticationException("Current password is incorrect");
    }
    await this.assertNotReused(userId, newPassword);

    await runInTransaction(this.dataSource, async (manager) => {
      const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      user.passwordHash = passwordHash;
      user.passwordChangedAt = new Date();
      user.mustChangePassword = false;
      await this.userRepository.save(user, manager);
      await this.passwordHistoryRepository.record(userId, passwordHash, manager);
    });
  }

  /** Uniform response regardless of whether `identifier` resolves — no user enumeration (§2.1). */
  async forgotPassword(identifier: string): Promise<{ sent: true }> {
    const user = await this.userRepository.findByIdentifier(identifier);
    if (user) {
      const token = randomBytes(32).toString("hex");
      await this.redis.set(RedisKeys.passwordResetToken(hashToken(token)), user.id, "EX", this.config.passwordResetTtlSeconds);

      const destination = user.email ?? user.phone ?? identifier;
      await this.notifications.send({
        to: destination,
        channel: user.email ? "EMAIL" : "SMS",
        subject: "Password reset",
        body: `A password reset was requested for your Klickit account. Token: ${token} (expires in ${Math.round(this.config.passwordResetTtlSeconds / 60)} minutes). If this wasn't you, ignore this message.`,
      });
    }
    return { sent: true };
  }

  /** Validates the reset token, sets the new password, and invalidates all sessions for that user (§2.7). */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const key = RedisKeys.passwordResetToken(hashToken(token));
    const userId = await this.redis.get(key);
    if (!userId) {
      throw new AuthenticationException("Invalid or expired reset token");
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AuthenticationException("Invalid or expired reset token");
    }
    await this.assertNotReused(userId, newPassword);

    await runInTransaction(this.dataSource, async (manager) => {
      const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      user.passwordHash = passwordHash;
      user.passwordChangedAt = new Date();
      user.mustChangePassword = false;
      await this.userRepository.save(user, manager);
      await this.passwordHistoryRepository.record(userId, passwordHash, manager);
      await this.sessionRepository.revokeAllForUser(userId, "PASSWORD_RESET", manager);
    });

    await this.redis.del(key);
  }

  private async assertNotReused(userId: string, newPassword: string): Promise<void> {
    const recent = await this.passwordHistoryRepository.findRecent(userId);
    for (const entry of recent) {
      if (await bcrypt.compare(newPassword, entry.passwordHash)) {
        throw new ValidationException("New password must not match any of the last 5 passwords used");
      }
    }
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

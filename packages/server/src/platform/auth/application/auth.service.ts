import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import * as bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import type { Redis } from "ioredis";
import { DataSource, EntityManager } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { OutboxWriterService } from "../../../shared/events/outbox-writer.service";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { REDIS_CLIENT } from "../../../shared/cache/redis.provider";
import { UsrUserEntity } from "../../users/domain/usr-user.entity";
import { AuthUsrUserRepository } from "../infrastructure/usr-user.repository";
import { UsrSessionRepository } from "../infrastructure/usr-session.repository";
import { UsrLoginEventRepository } from "../infrastructure/usr-login-event.repository";
import { PermissionResolutionRepository } from "../infrastructure/permission-resolution.repository";
import { JwtTokenService } from "../infrastructure/jwt-token.service";
import { RedisKeys } from "../infrastructure/redis-keys";
import { LockoutService } from "./lockout.service";
import { LoginSucceededEvent } from "../events/login-succeeded.event";
import { SessionFamilyRevokedEvent } from "../events/session-family-revoked.event";

const BCRYPT_ROUNDS = 12;
// Fixed, non-secret hash used only so `bcrypt.compare` runs on an unknown
// identifier too (timing-signal defense against username enumeration).
const DUMMY_HASH = bcrypt.hashSync("klickit-timing-defense", BCRYPT_ROUNDS);

export interface LoginOutcome {
  stage: "2fa" | "complete";
  preauthToken?: string;
  accessToken?: string;
  refreshToken?: string;
  user?: PublicUser;
  mustChangePassword?: boolean;
}

export interface PublicUser {
  id: string;
  username: string;
  fullName: string;
  userType: string;
  roles: string[];
}

@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly userRepository: AuthUsrUserRepository,
    private readonly sessionRepository: UsrSessionRepository,
    private readonly loginEventRepository: UsrLoginEventRepository,
    private readonly permissionResolution: PermissionResolutionRepository,
    private readonly lockoutService: LockoutService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly config: AppConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** FR-AUTH-001.1 — §2.1 staff login (password + optional TOTP). */
  async login(identifier: string, password: string, ip: string, userAgent: string): Promise<LoginOutcome> {
    const deviceFp = computeDeviceFp(ip, userAgent);

    if (await this.lockoutService.isLocked(identifier)) {
      await this.loginEventRepository.record({
        userId: null,
        usernameAttempted: identifier,
        success: false,
        failureReason: "LOCKED",
        ip,
        deviceFp,
      });
      throw new AuthenticationException("Account temporarily locked. Try again later.");
    }

    const user = await this.userRepository.findByIdentifier(identifier);
    const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

    // FR-AUTH-013.1: parents authenticate via OTP only, never password.
    const isEligible = !!user && user.userType !== "PARENT" && (user.status === "ACTIVE" || user.status === "INVITED");

    if (!user || !passwordOk || !isEligible) {
      const failureReason = !user
        ? "NO_SUCH_USER"
        : user.userType === "PARENT"
          ? "PASSWORD_LOGIN_NOT_ALLOWED"
          : !isEligible
            ? "ACCOUNT_NOT_ACTIVE"
            : "INVALID_CREDENTIALS";

      await this.loginEventRepository.record({
        userId: user?.id ?? null,
        usernameAttempted: identifier,
        success: false,
        failureReason,
        ip,
        deviceFp,
      });
      const justLocked = await this.lockoutService.registerFailure(identifier);
      if (justLocked) {
        // FR-AUTH-007.1 — lockout events notify the user (comms stub only in Module 1).
      }
      throw new AuthenticationException("Invalid credentials");
    }

    await this.lockoutService.reset(identifier);

    if (user.status === "INVITED") {
      // First successful password use activates the invited account (state machine: INVITED -> ACTIVE).
      user.status = "ACTIVE";
      await this.userRepository.save(user);
    }

    if (user.twofaEnabled) {
      const preauthToken = randomBytes(32).toString("hex");
      await this.redis.set(
        RedisKeys.preauthToken(preauthToken),
        JSON.stringify({ userId: user.id, ip, userAgent }),
        "EX",
        this.config.preauthTokenTtlSeconds,
      );
      await this.loginEventRepository.record({
        userId: user.id,
        usernameAttempted: identifier,
        success: true,
        failureReason: null,
        ip,
        deviceFp,
      });
      return { stage: "2fa", preauthToken };
    }

    return this.completeLogin(user, ip, userAgent, identifier, deviceFp);
  }

  /** §2.1 — pre-auth token consumption + TOTP verification is `TwoFactorService`'s concern for the crypto; this only finishes the session. */
  async completeLoginAfter2fa(userId: string, ip: string, userAgent: string): Promise<LoginOutcome> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AuthenticationException("Invalid pre-auth session");
    }
    return this.completeLogin(user, ip, userAgent, user.username, computeDeviceFp(ip, userAgent));
  }

  private async completeLogin(
    user: UsrUserEntity,
    ip: string,
    userAgent: string,
    usernameAttempted: string,
    deviceFp: string,
  ): Promise<LoginOutcome> {
    return runInTransaction(this.dataSource, async (manager) => {
      const effective = await this.permissionResolution.resolveForUser(user.id);

      const familyId = generateUuidV7();
      const { session, refreshToken } = await this.issueSession(user.id, familyId, ip, userAgent, manager);

      const accessToken = this.jwtTokenService.sign({
        sub: user.id,
        sid: session.id,
        roles: effective.roleNames,
        perms_hash: effective.permsHash,
        typ: "access",
      });
      await this.cachePermissionSet(effective.permsHash, effective.permissionCodes);

      await this.userRepository.touchLastLogin(user.id, manager);
      await this.loginEventRepository.record(
        { userId: user.id, usernameAttempted, success: true, failureReason: null, ip, deviceFp },
        manager,
      );
      await this.outboxWriter.write(
        manager,
        new LoginSucceededEvent(user.id, { sessionId: session.id, ip, userAgent }),
      );

      return {
        stage: "complete" as const,
        accessToken,
        refreshToken,
        mustChangePassword: user.mustChangePassword,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          userType: user.userType,
          roles: effective.roleNames,
        },
      };
    });
  }

  /** FR-AUTH-002.1 — rotation on every refresh; reuse of a rotated token revokes the whole family. */
  async refresh(refreshToken: string): Promise<LoginOutcome> {
    const hash = hashToken(refreshToken);
    const existing = await this.sessionRepository.findByRefreshTokenHash(hash);
    if (!existing) {
      throw new AuthenticationException("Invalid refresh token");
    }
    if (existing.revokedAt) {
      await this.revokeFamilyOnReuse(existing.familyId);
      throw new AuthenticationException("Refresh token reuse detected — session revoked");
    }

    return runInTransaction(this.dataSource, async (manager) => {
      await this.sessionRepository.revoke(existing.id, "ROTATED", manager);
      await this.redis.set(RedisKeys.sessionRevoked(existing.id), "1", "EX", 7 * 24 * 60 * 60);

      const user = await this.userRepository.findById(existing.userId, manager);
      if (!user) {
        throw new AuthenticationException("Invalid refresh token");
      }

      const effective = await this.permissionResolution.resolveForUser(user.id);
      const { session, refreshToken: newRefreshToken } = await this.issueSession(
        user.id,
        existing.familyId,
        existing.ip,
        existing.userAgent,
        manager,
      );

      const accessToken = this.jwtTokenService.sign({
        sub: user.id,
        sid: session.id,
        roles: effective.roleNames,
        perms_hash: effective.permsHash,
        typ: "access",
      });
      await this.cachePermissionSet(effective.permsHash, effective.permissionCodes);

      return {
        stage: "complete" as const,
        accessToken,
        refreshToken: newRefreshToken,
        mustChangePassword: user.mustChangePassword,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          userType: user.userType,
          roles: effective.roleNames,
        },
      };
    });
  }

  async logout(sessionId: string): Promise<void> {
    await runInTransaction(this.dataSource, async (manager) => {
      await this.sessionRepository.revoke(sessionId, "LOGOUT", manager);
    });
    await this.redis.set(RedisKeys.sessionRevoked(sessionId), "1", "EX", 7 * 24 * 60 * 60);
  }

  private async revokeFamilyOnReuse(familyId: string): Promise<void> {
    await runInTransaction(this.dataSource, async (manager) => {
      const familySessions = await this.sessionRepository.findFamily(familyId, manager);
      await this.sessionRepository.revokeFamily(familyId, "REUSE_DETECTED", manager);
      for (const session of familySessions) {
        await this.redis.set(RedisKeys.sessionRevoked(session.id), "1", "EX", 7 * 24 * 60 * 60);
      }
      if (familySessions.length > 0) {
        await this.outboxWriter.write(
          manager,
          new SessionFamilyRevokedEvent(familySessions[0].userId, { familyId, reason: "REUSE_DETECTED" }),
        );
      }
    });
  }

  private async issueSession(
    userId: string,
    familyId: string,
    ip: string,
    userAgent: string,
    manager: EntityManager,
  ): Promise<{ session: { id: string }; refreshToken: string }> {
    const refreshToken = randomBytes(32).toString("hex"); // 256-bit opaque token
    const session = await this.sessionRepository.create(
      {
        userId,
        familyId,
        refreshTokenHash: hashToken(refreshToken),
        device: userAgent.slice(0, 160),
        ip,
        userAgent,
        lastSeenAt: new Date(),
      },
      manager,
    );
    return { session, refreshToken };
  }

  private async cachePermissionSet(permsHash: string, permissionCodes: string[]): Promise<void> {
    await this.redis.set(
      RedisKeys.permsCache(permsHash),
      JSON.stringify(permissionCodes),
      "EX",
      this.config.refreshTokenTtlDays * 24 * 60 * 60,
    );
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function computeDeviceFp(ip: string, userAgent: string): string {
  return createHash("sha256").update(`${ip}|${userAgent}`).digest("hex").slice(0, 64);
}

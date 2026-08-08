import { Inject, Injectable } from "@nestjs/common";
import { authenticator } from "otplib";
import { randomBytes, createHash } from "node:crypto";
import type { Redis } from "ioredis";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { encryptToBuffer, decryptFromBuffer } from "../../../shared/crypto/aes-gcm.util";
import { REDIS_CLIENT } from "../../../shared/cache/redis.provider";
import { AuthUsrUserRepository } from "../infrastructure/usr-user.repository";
import { RedisKeys } from "../infrastructure/redis-keys";
import { AuthService } from "./auth.service";
import type { LoginOutcome } from "./auth.service";

const RECOVERY_CODE_COUNT = 8;
const TOTP_STEP_SECONDS = 30;
const TOTP_WINDOW = 1; // ±1 step, per §2.1
const ISSUER = "Klickit Finance ERP";

authenticator.options = { step: TOTP_STEP_SECONDS, window: TOTP_WINDOW };

export interface EnrollResult {
  otpauthUri: string;
  manualKey: string;
}

export interface ActivateResult {
  recoveryCodes: string[];
}

/** FR-AUTH-004.1 — enrollment, activation, and disable of TOTP-based 2FA. */
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly userRepository: AuthUsrUserRepository,
    private readonly config: AppConfigService,
    private readonly authService: AuthService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async enroll(userId: string): Promise<EnrollResult> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AuthenticationException("Unknown user");
    }
    const secret = authenticator.generateSecret();
    const otpauthUri = authenticator.keyuri(user.username, ISSUER, secret);

    user.twofaSecretEnc = encryptToBuffer(secret, this.config.appEncryptionKeyBase64);
    // twofaEnabled stays false until `activateEnroll` verifies one code.
    await this.userRepository.save(user);

    return { otpauthUri, manualKey: secret };
  }

  async activateEnroll(userId: string, code: string): Promise<ActivateResult> {
    const user = await this.userRepository.findById(userId);
    if (!user || !user.twofaSecretEnc) {
      throw new ValidationException("2FA has not been enrolled for this user");
    }
    const secret = decryptFromBuffer(user.twofaSecretEnc, this.config.appEncryptionKeyBase64);
    if (!authenticator.check(code, secret)) {
      throw new AuthenticationException("Invalid verification code");
    }

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => randomBytes(5).toString("hex"));
    const hashedCodes = recoveryCodes.map((c) => hashRecoveryCode(c));

    user.twofaEnabled = true;
    user.recoveryCodesEnc = encryptToBuffer(JSON.stringify(hashedCodes), this.config.appEncryptionKeyBase64);
    await this.userRepository.save(user);

    return { recoveryCodes };
  }

  async disable(userId: string, code: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user || !user.twofaEnabled || !user.twofaSecretEnc) {
      throw new ValidationException("2FA is not enabled for this user");
    }
    const secret = decryptFromBuffer(user.twofaSecretEnc, this.config.appEncryptionKeyBase64);
    const validTotp = authenticator.check(code, secret);
    const validRecovery = user.recoveryCodesEnc
      ? (JSON.parse(decryptFromBuffer(user.recoveryCodesEnc, this.config.appEncryptionKeyBase64)) as string[]).includes(
          hashRecoveryCode(code),
        )
      : false;
    if (!validTotp && !validRecovery) {
      throw new AuthenticationException("Invalid verification code");
    }

    user.twofaEnabled = false;
    user.twofaSecretEnc = null;
    user.recoveryCodesEnc = null;
    await this.userRepository.save(user);
  }

  /** §2.1 `POST /auth/2fa/verify` — consumes the pre-auth token and completes the session. */
  async verify(preauthToken: string, code: string): Promise<LoginOutcome> {
    const raw = await this.redis.get(RedisKeys.preauthToken(preauthToken));
    if (!raw) {
      throw new AuthenticationException("Pre-auth token expired or invalid");
    }
    const { userId, ip, userAgent } = JSON.parse(raw) as { userId: string; ip: string; userAgent: string };

    const user = await this.userRepository.findById(userId);
    if (!user || !user.twofaSecretEnc) {
      throw new AuthenticationException("2FA is not configured for this account");
    }
    const secret = decryptFromBuffer(user.twofaSecretEnc, this.config.appEncryptionKeyBase64);

    if (!authenticator.check(code, secret)) {
      throw new AuthenticationException("Invalid 2FA code");
    }

    // Replay-guard: SETNX per (user, code, current TOTP period) for the code's validity window.
    const period = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
    const replayKey = RedisKeys.totpReplayGuard(userId, code, period);
    const firstUse = await this.redis.set(replayKey, "1", "EX", TOTP_STEP_SECONDS * (2 * TOTP_WINDOW + 1), "NX");
    if (firstUse === null) {
      throw new AuthenticationException("This code has already been used");
    }

    await this.redis.del(RedisKeys.preauthToken(preauthToken));
    return this.authService.completeLoginAfter2fa(userId, ip, userAgent);
  }
}

function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

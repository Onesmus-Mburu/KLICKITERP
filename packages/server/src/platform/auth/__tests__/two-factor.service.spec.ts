import { authenticator } from "otplib";
import { TwoFactorService } from "../application/two-factor.service";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { encryptToBuffer } from "../../../shared/crypto/aes-gcm.util";
import { FakeRedis } from "./support/fake-redis";

const ENCRYPTION_KEY_BASE64 = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

describe("TwoFactorService", () => {
  let userRepository: { findById: jest.Mock; save: jest.Mock };
  let config: { appEncryptionKeyBase64: string };
  let authService: { completeLoginAfter2fa: jest.Mock };
  let redis: FakeRedis;
  let service: TwoFactorService;

  const dbUser = (overrides: Record<string, unknown> = {}) => ({
    id: "user-1",
    username: "jdoe",
    twofaEnabled: false,
    twofaSecretEnc: null as Buffer | null,
    recoveryCodesEnc: null as Buffer | null,
    ...overrides,
  });

  beforeEach(() => {
    userRepository = { findById: jest.fn(), save: jest.fn(async (u: unknown) => u) };
    config = { appEncryptionKeyBase64: ENCRYPTION_KEY_BASE64 };
    authService = { completeLoginAfter2fa: jest.fn(async () => ({ stage: "complete" as const })) };
    redis = new FakeRedis();
    service = new TwoFactorService(userRepository as never, config as never, authService as never, redis as never);
  });

  it("enroll() returns an otpauth URI + manual key and stores the encrypted secret (not yet enabled)", async () => {
    const user = dbUser();
    userRepository.findById.mockResolvedValue(user);

    const result = await service.enroll("user-1");

    expect(result.otpauthUri).toContain("otpauth://totp/");
    expect(result.manualKey).toEqual(expect.any(String));
    expect(userRepository.save).toHaveBeenCalled();
    const saved = userRepository.save.mock.calls[0][0];
    expect(saved.twofaSecretEnc).toBeInstanceOf(Buffer);
    expect(saved.twofaEnabled).toBe(false);
  });

  it("activateEnroll() verifies one code, enables 2FA, and issues recovery codes", async () => {
    const secret = authenticator.generateSecret();
    const user = dbUser({ twofaSecretEnc: encryptSecretForTest(secret) });
    userRepository.findById.mockResolvedValue(user);

    const code = authenticator.generate(secret);
    const result = await service.activateEnroll("user-1", code);

    expect(result.recoveryCodes).toHaveLength(8);
    const saved = userRepository.save.mock.calls[0][0];
    expect(saved.twofaEnabled).toBe(true);
    expect(saved.recoveryCodesEnc).toBeInstanceOf(Buffer);
  });

  it("activateEnroll() rejects an invalid code", async () => {
    const secret = authenticator.generateSecret();
    userRepository.findById.mockResolvedValue(dbUser({ twofaSecretEnc: encryptSecretForTest(secret) }));

    await expect(service.activateEnroll("user-1", "000000")).rejects.toBeInstanceOf(AuthenticationException);
  });

  it("verify() consumes the pre-auth token and completes login on a correct code", async () => {
    const secret = authenticator.generateSecret();
    const user = dbUser({ twofaEnabled: true, twofaSecretEnc: encryptSecretForTest(secret) });
    userRepository.findById.mockResolvedValue(user);
    await redis.set("auth:preauth:tok-1", JSON.stringify({ userId: "user-1", ip: "1.1.1.1", userAgent: "ua" }), "EX", 90);

    const code = authenticator.generate(secret);
    const result = await service.verify("tok-1", code);

    expect(result.stage).toBe("complete");
    expect(authService.completeLoginAfter2fa).toHaveBeenCalledWith("user-1", "1.1.1.1", "ua");
    expect(await redis.get("auth:preauth:tok-1")).toBeNull();
  });

  it("verify() rejects replay of the same code within its validity window", async () => {
    const secret = authenticator.generateSecret();
    const user = dbUser({ twofaEnabled: true, twofaSecretEnc: encryptSecretForTest(secret) });
    userRepository.findById.mockResolvedValue(user);
    const code = authenticator.generate(secret);

    await redis.set("auth:preauth:tok-a", JSON.stringify({ userId: "user-1", ip: "1.1.1.1", userAgent: "ua" }), "EX", 90);
    await service.verify("tok-a", code);

    await redis.set("auth:preauth:tok-b", JSON.stringify({ userId: "user-1", ip: "1.1.1.1", userAgent: "ua" }), "EX", 90);
    await expect(service.verify("tok-b", code)).rejects.toBeInstanceOf(AuthenticationException);
  });

  it("verify() rejects an expired/unknown pre-auth token", async () => {
    await expect(service.verify("does-not-exist", "123456")).rejects.toBeInstanceOf(AuthenticationException);
  });

  it("disable() clears the secret and recovery codes given a valid code", async () => {
    const secret = authenticator.generateSecret();
    const user = dbUser({ twofaEnabled: true, twofaSecretEnc: encryptSecretForTest(secret) });
    userRepository.findById.mockResolvedValue(user);

    await service.disable("user-1", authenticator.generate(secret));

    const saved = userRepository.save.mock.calls[0][0];
    expect(saved.twofaEnabled).toBe(false);
    expect(saved.twofaSecretEnc).toBeNull();
  });
});

function encryptSecretForTest(secret: string): Buffer {
  return encryptToBuffer(secret, ENCRYPTION_KEY_BASE64);
}

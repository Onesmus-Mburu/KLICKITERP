import { generateKeyPairSync } from "node:crypto";
import { AppConfigService } from "../../shared/config/app-config.service";
import { AuthenticationException } from "../../shared/exceptions/authentication.exception";
import { JwsClaims, JwsMutualAuthService, signCompactJws, verifyCompactJws } from "../infrastructure/crypto/jws-mutual-auth";

function makeKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }) as string,
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
  };
}

describe("compact JWS sign/verify (pure functions)", () => {
  const { publicKeyPem, privateKeyPem } = makeKeyPair();

  it("round-trips a signed token", () => {
    const claims: JwsClaims = { iss: "test", aud: "school-1", iat: 1_000, exp: 1_300, jti: "abc", body: { hello: "world" } };
    const token = signCompactJws(claims, privateKeyPem, "kid-1");

    const decoded = verifyCompactJws(token, (kid) => (kid === "kid-1" ? publicKeyPem : null));

    expect(decoded.claims).toEqual(claims);
    expect(decoded.header).toEqual({ alg: "EdDSA", kid: "kid-1", typ: "JWT" });
  });

  it("rejects an unknown kid", () => {
    const claims: JwsClaims = { iss: "test", aud: "school-1", iat: 1_000, exp: 1_300, jti: "abc", body: {} };
    const token = signCompactJws(claims, privateKeyPem, "kid-1");

    expect(() => verifyCompactJws(token, () => null)).toThrow(AuthenticationException);
  });

  it("rejects a tampered payload", () => {
    const claims: JwsClaims = { iss: "test", aud: "school-1", iat: 1_000, exp: 1_300, jti: "abc", body: {} };
    const token = signCompactJws(claims, privateKeyPem, "kid-1");
    const [header, , signature] = token.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ ...claims, aud: "school-2" }), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    expect(() => verifyCompactJws(`${header}.${tamperedPayload}.${signature}`, () => publicKeyPem)).toThrow(AuthenticationException);
  });

  it("rejects a malformed token (wrong number of segments)", () => {
    expect(() => verifyCompactJws("not-a-jws", () => publicKeyPem)).toThrow(AuthenticationException);
  });
});

describe("JwsMutualAuthService", () => {
  const { publicKeyPem, privateKeyPem } = makeKeyPair();
  let redis: { set: jest.Mock };
  let config: AppConfigService;
  let service: JwsMutualAuthService;

  beforeEach(() => {
    redis = { set: jest.fn().mockResolvedValue("OK") };
    config = {
      infoneyLicensePublicKeyCurrent: { kid: "infoney-1", publicKey: publicKeyPem },
      infoneyLicensePublicKeyPrevious: null,
      instancePrivateKeyPem: privateKeyPem,
    } as unknown as AppConfigService;
    service = new JwsMutualAuthService(config, redis as never);
  });

  function signRequest(overrides: Partial<JwsClaims> = {}): string {
    const now = Math.floor(Date.now() / 1000);
    const claims: JwsClaims = {
      iss: "infoney",
      aud: "school-1",
      iat: now,
      exp: now + 60,
      jti: "jti-1",
      body: { hello: "world" },
      ...overrides,
    };
    return signCompactJws(claims, privateKeyPem, "infoney-1");
  }

  it("verifies a valid inbound request and marks its jti as used (replay-cache write)", async () => {
    const token = signRequest();

    const result = await service.verifyInbound(token, "school-1");

    expect(result.kid).toBe("infoney-1");
    expect(result.claims.body).toEqual({ hello: "world" });
    expect(redis.set).toHaveBeenCalledWith(expect.stringContaining("jti-1"), "1", "EX", expect.any(Number), "NX");
  });

  it("rejects a replayed jti", async () => {
    redis.set.mockResolvedValueOnce("OK").mockResolvedValueOnce(null);
    const token = signRequest();

    await service.verifyInbound(token, "school-1");
    await expect(service.verifyInbound(token, "school-1")).rejects.toBeInstanceOf(AuthenticationException);
  });

  it("rejects an expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signRequest({ iat: now - 400, exp: now - 100 });

    await expect(service.verifyInbound(token, "school-1")).rejects.toBeInstanceOf(AuthenticationException);
  });

  it("rejects a token whose validity window exceeds the 5 minute maximum", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signRequest({ iat: now, exp: now + 3600 });

    await expect(service.verifyInbound(token, "school-1")).rejects.toBeInstanceOf(AuthenticationException);
  });

  it("rejects a mismatched audience", async () => {
    const token = signRequest({ aud: "some-other-school" });

    await expect(service.verifyInbound(token, "school-1")).rejects.toBeInstanceOf(AuthenticationException);
  });

  it("tries the previous Infoney key when the current one doesn't match the token's kid", async () => {
    const previous = makeKeyPair();
    config = {
      infoneyLicensePublicKeyCurrent: { kid: "infoney-2", publicKey: publicKeyPem },
      infoneyLicensePublicKeyPrevious: { kid: "infoney-1", publicKey: previous.publicKeyPem },
      instancePrivateKeyPem: privateKeyPem,
    } as unknown as AppConfigService;
    service = new JwsMutualAuthService(config, redis as never);

    const now = Math.floor(Date.now() / 1000);
    const claims: JwsClaims = { iss: "infoney", aud: "school-1", iat: now, exp: now + 60, jti: "jti-rot", body: {} };
    const token = signCompactJws(claims, previous.privateKeyPem, "infoney-1");

    const result = await service.verifyInbound(token, "school-1");
    expect(result.kid).toBe("infoney-1");
  });

  it("signs an outbound response with the instance key, verifiable against the same instance public key", () => {
    const token = service.signOutbound({ ok: true }, "school-1");

    const decoded = verifyCompactJws(token, (kid) => (kid === "instance" ? publicKeyPem : null));
    expect(decoded.claims.body).toEqual({ ok: true });
    expect(decoded.claims.aud).toBe("school-1");
    expect(decoded.claims.iss).toBe("instance");
  });
});

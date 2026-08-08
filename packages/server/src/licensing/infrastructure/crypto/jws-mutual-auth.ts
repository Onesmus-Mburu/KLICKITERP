import { Inject, Injectable } from "@nestjs/common";
import { createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import type { Redis } from "ioredis";
import { REDIS_CLIENT } from "../../../shared/cache/redis.provider";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { generateUuidV7 } from "../../../shared/ids/uuid7";

/** The 5-minute maximum request/response validity window, docs/phase-3/02-communication-authentication.md §2.6 ("exp ≤ 5 min"). */
export const JWS_MAX_VALIDITY_SECONDS = 5 * 60;

export interface JwsHeader {
  alg: "EdDSA";
  kid: string;
  typ: "JWT";
}

/** Envelope carried by every `/license/v1/*` request/response — `body` is the handler-specific payload. */
export interface JwsClaims {
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
  body: unknown;
}

export interface DecodedJws {
  header: JwsHeader;
  claims: JwsClaims;
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padLength), "base64");
}

/**
 * Signs a compact JWS (`base64url(header).base64url(payload).base64url(signature)`)
 * with an Ed25519 private key — hand-rolled rather than a library, same
 * choice `crypto/license-file-verifier.ts` makes and for the same reason:
 * this codebase's `jsonwebtoken` dependency (used elsewhere for ES256
 * session JWTs) has no confirmed `EdDSA`/Ed25519 support in the pinned
 * version, and the mutual-auth flow's shape (arbitrary `body` payload,
 * `kid`-based key rotation, `jti` replay-cache) is simple enough that a
 * ~20-line hand-rolled compact-JWS implementation is less risk than
 * chasing library algorithm support.
 */
export function signCompactJws(claims: JwsClaims, privateKeyPem: string, kid: string): string {
  const header: JwsHeader = { alg: "EdDSA", kid, typ: "JWT" };
  const encodedHeader = base64UrlEncode(Buffer.from(JSON.stringify(header), "utf8"));
  const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify(claims), "utf8"));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const privateKey = createPrivateKey(privateKeyPem);
  const signature = cryptoSign(null, Buffer.from(signingInput, "utf8"), privateKey);

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

/**
 * Verifies a compact JWS's structure + Ed25519 signature only (no
 * exp/aud/jti business-rule checks — those live in `JwsMutualAuthService.verifyInbound()`
 * below, which needs DI for config/Redis). `resolvePublicKeyPem` is a
 * `kid -> PEM | null` lookup so this function stays pure/framework-free.
 */
export function verifyCompactJws(token: string, resolvePublicKeyPem: (kid: string) => string | null): DecodedJws {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AuthenticationException("Malformed JWS token");
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  let header: JwsHeader;
  let claims: JwsClaims;
  try {
    header = JSON.parse(base64UrlDecode(encodedHeader).toString("utf8")) as JwsHeader;
    claims = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8")) as JwsClaims;
  } catch {
    throw new AuthenticationException("Malformed JWS token");
  }

  if (header.alg !== "EdDSA" || !header.kid) {
    throw new AuthenticationException("Unsupported JWS header");
  }

  const publicKeyPem = resolvePublicKeyPem(header.kid);
  if (!publicKeyPem) {
    throw new AuthenticationException(`Unknown JWS signing key "${header.kid}"`);
  }

  let isValid: boolean;
  try {
    const publicKey = createPublicKey(publicKeyPem);
    const signingInput = Buffer.from(`${encodedHeader}.${encodedPayload}`, "utf8");
    const signature = base64UrlDecode(encodedSignature);
    isValid = cryptoVerify(null, signingInput, publicKey, signature);
  } catch {
    isValid = false;
  }
  if (!isValid) {
    throw new AuthenticationException("JWS signature verification failed");
  }

  return { header, claims };
}

export interface VerifiedInboundRequest {
  claims: JwsClaims;
  kid: string;
}

/**
 * DI-aware orchestration around the pure functions above, implementing the
 * full `docs/phase-3/02-communication-authentication.md` §2.6 mutual-auth
 * flow: `verifyInbound()` is what `LicenseMutualAuthGuard` (licensing/api)
 * calls for every inbound Super Admin portal request — signature (via
 * `verifyCompactJws`, resolving against `AppConfigService`'s current/previous
 * Infoney public keys for §2.6's "dual-key overlap window" rotation),
 * `exp` not passed, the request's total validity window `<=5min`, `aud`
 * matching this instance's own `school_id`, and a Redis-backed `jti`
 * replay-cache (`SET NX EX`, same idiom `TwoFactorService`'s own TOTP
 * replay-guard uses). `signOutbound()` is what every `/license/v1/*`
 * handler calls to sign its response with THIS instance's own private key
 * before returning it — the portal verifies that signature against the
 * public key registered at provisioning time (a real Super Admin portal to
 * test that verification against does not exist in this environment, an
 * honestly documented gap, see docs/phase-5/PROGRESS.md).
 */
@Injectable()
export class JwsMutualAuthService {
  constructor(
    private readonly config: AppConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async verifyInbound(token: string, expectedAudience: string): Promise<VerifiedInboundRequest> {
    const { header, claims } = verifyCompactJws(token, (kid) => this.resolveInfoneyPublicKey(kid));

    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== "number" || claims.exp <= now) {
      throw new AuthenticationException("JWS token has expired");
    }
    if (typeof claims.iat !== "number" || claims.exp - claims.iat > JWS_MAX_VALIDITY_SECONDS) {
      throw new AuthenticationException("JWS token validity window exceeds the 5 minute maximum");
    }
    if (claims.aud !== expectedAudience) {
      throw new AuthenticationException("JWS token audience does not match this instance");
    }
    if (!claims.jti || typeof claims.jti !== "string") {
      throw new AuthenticationException("JWS token missing jti");
    }

    const replayKey = `license:jti:${claims.jti}`;
    const ttlSeconds = Math.max(1, claims.exp - now);
    const firstUse = await this.redis.set(replayKey, "1", "EX", ttlSeconds, "NX");
    if (firstUse === null) {
      throw new AuthenticationException("JWS token has already been used (replay)");
    }

    return { claims, kid: header.kid };
  }

  signOutbound(body: unknown, audience: string): string {
    const now = Math.floor(Date.now() / 1000);
    const claims: JwsClaims = {
      iss: "instance",
      aud: audience,
      iat: now,
      exp: now + JWS_MAX_VALIDITY_SECONDS,
      jti: generateUuidV7(),
      body,
    };
    return signCompactJws(claims, this.config.instancePrivateKeyPem, "instance");
  }

  private resolveInfoneyPublicKey(kid: string): string | null {
    const current = this.config.infoneyLicensePublicKeyCurrent;
    if (kid === current.kid) {
      return current.publicKey;
    }
    const previous = this.config.infoneyLicensePublicKeyPrevious;
    if (previous && kid === previous.kid) {
      return previous.publicKey;
    }
    return null;
  }
}

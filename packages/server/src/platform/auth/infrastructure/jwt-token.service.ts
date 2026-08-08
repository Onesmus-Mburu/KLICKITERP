import { Injectable } from "@nestjs/common";
import jwt from "jsonwebtoken";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";

export type AccessTokenType = "access" | "parent";

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  roles: string[];
  perms_hash: string;
  typ: AccessTokenType;
}

/**
 * ES256 access-JWT sign/verify (docs/phase-3/02-communication-authentication.md
 * §2.1: `sub, sid, roles, perms_hash, typ` — 15 min — rotatable keypair via
 * `kid` header). Verification tries the current keypair then, if present,
 * the previous one (rotation overlap window per §2.6-style dual-key
 * pattern applied here to §2.7's session key).
 */
@Injectable()
export class JwtTokenService {
  constructor(private readonly config: AppConfigService) {}

  sign(claims: AccessTokenClaims): string {
    const keyPair = this.config.jwtKeyCurrent;
    return jwt.sign(claims, keyPair.privateKey, {
      algorithm: "ES256",
      expiresIn: `${this.config.accessTokenTtlMinutes}m`,
      keyid: keyPair.kid,
    });
  }

  verify(token: string): AccessTokenClaims {
    const header = decodeHeader(token);
    const current = this.config.jwtKeyCurrent;
    const previous = this.config.jwtKeyPrevious;
    const candidate = previous && header.kid === previous.kid ? previous : current;

    try {
      const payload = jwt.verify(token, candidate.publicKey, { algorithms: ["ES256"] });
      return payload as unknown as AccessTokenClaims;
    } catch {
      throw new AuthenticationException("Invalid or expired access token");
    }
  }
}

function decodeHeader(token: string): { kid?: string } {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === "string") {
    throw new AuthenticationException("Malformed access token");
  }
  return decoded.header;
}

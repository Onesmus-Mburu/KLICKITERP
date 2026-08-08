import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { AppConfigService } from "../../shared/config/app-config.service";
import { AuthenticationException } from "../../shared/exceptions/authentication.exception";
import { JwsMutualAuthService } from "../infrastructure/crypto/jws-mutual-auth";
import { LicenseMutualAuthRequest } from "./request-context";

export const LICENSE_JWS_HEADER_NAME = "x-license-jws";

interface MinimalHttpRequest extends LicenseMutualAuthRequest {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * The JWS-based guard for `/license/v1/*` ONLY (docs/phase-3/02-communication-authentication.md
 * §2.6) — applied at the controller level (`license-api.controller.ts`),
 * completely separate from the normal `JwtAuthGuard`/`LicenseStateGuard`/
 * `PermissionsGuard`/`AuthorityGuard` global `APP_GUARD` pipeline. Super
 * Admin portal calls carry no user session JWT at all — they're
 * machine-to-machine, JWS-signed with Infoney's own private key.
 *
 * The verified JWS compact token travels in the `X-License-Jws` request
 * header (not the body) so the SAME mechanism works uniformly across all 9
 * endpoints' HTTP methods, including the two GETs (`status`/`usage`) — a
 * body-based convention would need a special case for GET requests.
 * Verification itself (signature, `exp`, `aud`, `jti` replay) is delegated
 * to `JwsMutualAuthService.verifyInbound()`; this guard's only job is
 * extracting the header and attaching the verified result to the request
 * for the controller to read.
 */
@Injectable()
export class LicenseMutualAuthGuard implements CanActivate {
  constructor(
    private readonly jwsMutualAuth: JwsMutualAuthService,
    private readonly config: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<MinimalHttpRequest>();
    const header = request.headers[LICENSE_JWS_HEADER_NAME];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token) {
      throw new AuthenticationException(`Missing ${LICENSE_JWS_HEADER_NAME} header`);
    }

    request.licenseAuth = await this.jwsMutualAuth.verifyInbound(token, this.config.schoolId);
    return true;
  }
}

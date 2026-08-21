import { Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthenticationException } from "../../shared/exceptions/authentication.exception";
import { Public } from "../../shared/rbac/public.decorator";
import { ExemptFromLicenseGuard } from "../../shared/rbac/exempt-from-license-guard.decorator";
import { ApiCallLoggerService } from "../application/api-call-logger.service";
import {
  ActivateInput,
  LicenseApiService,
  RegisterInput,
  RenewInput,
  SubscriptionInput,
  UpdateNoticeInput,
} from "../application/license-api.service";
import { JwsMutualAuthService, VerifiedInboundRequest } from "../infrastructure/crypto/jws-mutual-auth";
import { LicenseMutualAuthGuard } from "./license-mutual-auth.guard";
import { LicenseMutualAuthRequest } from "./request-context";

/**
 * FR-LIC-002.1's exhaustive `/license/v1/*` endpoint surface — 9 enumerated
 * handlers, each a narrow, specific state transition or read on
 * `license.license`/`license.update_notice` (see `LicenseApiService`'s own
 * doc comment). Guarded by `LicenseMutualAuthGuard` (JWS mutual-auth, NOT
 * the normal JWT pipeline). Every response is itself JWS-signed with this
 * INSTANCE's own private key before returning (§2.6's mutual-auth flow) —
 * the `{token}` envelope IS the response body; there is no parallel
 * unsigned JSON body, so a caller MUST verify the signature to read the
 * result, matching §2.6's "portal verifies the instance's signature"
 * requirement literally. Every call is logged both directions per BR-LIC-04
 * via `ApiCallLoggerService.wrap()`.
 *
 * **Fixed 2026-08-21 — was completely unreachable before this class-level
 * `@Public()` + `@ExemptFromLicenseGuard()` pair**: the global `JwtAuthGuard`
 * (an `APP_GUARD`, runs before this class's own `@UseGuards()`) rejected
 * every call for lacking a session bearer token — this caller is an
 * external Super Admin portal authenticating via JWS mutual-auth, not a
 * logged-in staff session, so it never had one. `@ExemptFromLicenseGuard()`
 * is needed too: a `SUSPENDED`/`GRACE`/`DEACTIVATED` instance is exactly
 * when the portal most needs to call `activate`/`renew`/`suspend` — see
 * `shared/rbac/license-state.guard.ts`.
 */
@ApiTags("license-api")
@Controller("license/v1")
@UseGuards(LicenseMutualAuthGuard)
@Public()
@ExemptFromLicenseGuard()
export class LicenseApiController {
  constructor(
    private readonly licenseApiService: LicenseApiService,
    private readonly apiCallLogger: ApiCallLoggerService,
    private readonly jwsMutualAuth: JwsMutualAuthService,
  ) {}

  @Post("register")
  @ApiOperation({ summary: "Provision (or re-provision) this instance's license row — resets state to PROVISIONED" })
  async register(@Req() req: LicenseMutualAuthRequest): Promise<{ token: string }> {
    return this.handle("register", req, (body) => this.licenseApiService.register(body as RegisterInput));
  }

  @Post("subscription")
  @ApiOperation({ summary: "Update plan/features on the existing license row — never touches state" })
  async subscription(@Req() req: LicenseMutualAuthRequest): Promise<{ token: string }> {
    return this.handle("subscription", req, (body) => this.licenseApiService.subscription(body as SubscriptionInput));
  }

  @Post("activate")
  @ApiOperation({ summary: "PROVISIONED|SUSPENDED|GRACE -> ACTIVE, optionally refreshing the date window" })
  async activate(@Req() req: LicenseMutualAuthRequest): Promise<{ token: string }> {
    return this.handle("activate", req, (body) => this.licenseApiService.activate(body as ActivateInput));
  }

  @Post("suspend")
  @ApiOperation({ summary: "ACTIVE|GRACE -> SUSPENDED (manual Super Admin suspension, e.g. non-payment)" })
  async suspend(@Req() req: LicenseMutualAuthRequest): Promise<{ token: string }> {
    return this.handle("suspend", req, () => this.licenseApiService.suspend());
  }

  @Post("renew")
  @ApiOperation({ summary: "Extend valid_to/grace_days and re-derive state — the normal path back to ACTIVE" })
  async renew(@Req() req: LicenseMutualAuthRequest): Promise<{ token: string }> {
    return this.handle("renew", req, (body) => this.licenseApiService.renew(body as RenewInput));
  }

  @Post("deactivate")
  @ApiOperation({ summary: "Manual deactivation from any state (terminal in this pass)" })
  async deactivate(@Req() req: LicenseMutualAuthRequest): Promise<{ token: string }> {
    return this.handle("deactivate", req, () => this.licenseApiService.deactivate());
  }

  @Get("status")
  @ApiOperation({ summary: "Current license state/plan/expiry, as seen by the Super Admin portal" })
  async status(@Req() req: LicenseMutualAuthRequest): Promise<{ token: string }> {
    return this.handle("status", req, () => this.licenseApiService.status());
  }

  @Get("usage")
  @ApiOperation({ summary: "FR-LIC-005.1's exact usage payload — also writes a license.usage_snapshot row" })
  async usage(@Req() req: LicenseMutualAuthRequest): Promise<{ token: string }> {
    return this.handle("usage", req, () => this.licenseApiService.usage());
  }

  @Post("update-notice")
  @ApiOperation({ summary: "Record a new version/security update notice, decision starts PENDING" })
  async updateNotice(@Req() req: LicenseMutualAuthRequest): Promise<{ token: string }> {
    return this.handle("update-notice", req, (body) => this.licenseApiService.updateNotice(body as UpdateNoticeInput));
  }

  /** Every handler's single call site: log inbound, run the narrow service method, log outbound, sign the response. */
  private async handle<T>(
    endpoint: string,
    req: LicenseMutualAuthRequest,
    work: (body: unknown) => Promise<T>,
  ): Promise<{ token: string }> {
    const auth = this.requireAuth(req);
    const result = await this.apiCallLogger.wrap(endpoint, auth.kid, auth.claims.body, () => work(auth.claims.body));
    const token = this.jwsMutualAuth.signOutbound(result, auth.claims.aud);
    return { token };
  }

  private requireAuth(req: LicenseMutualAuthRequest): VerifiedInboundRequest {
    if (!req.licenseAuth) {
      // Unreachable in practice — LicenseMutualAuthGuard always populates this or throws first — but keeps this method's return type honest.
      throw new AuthenticationException("License mutual-auth verification did not run");
    }
    return req.licenseAuth;
  }
}

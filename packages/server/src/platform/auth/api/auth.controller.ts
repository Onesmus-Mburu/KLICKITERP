import { Body, Controller, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { AuthService } from "../application/auth.service";
import { TwoFactorService } from "../application/two-factor.service";
import { OtpService } from "../application/otp.service";
import { PasswordService } from "../application/password.service";
import { Public } from "../../../shared/rbac/public.decorator";
import { ExemptFromLicenseGuard } from "../../../shared/rbac/exempt-from-license-guard.decorator";
import { LoginDto } from "./dto/login.dto";
import { TwoFactorVerifyDto } from "./dto/two-factor-verify.dto";
import { TwoFactorCodeDto } from "./dto/two-factor-code.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { OtpRequestDto } from "./dto/otp-request.dto";
import { OtpVerifyDto } from "./dto/otp-verify.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { AuthenticatedRequest, extractIp, extractUserAgent } from "./request-context";

/** Controllers stay thin: DTO -> service call only (architecture doc §4.2). */
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly twoFactorService: TwoFactorService,
    private readonly otpService: OtpService,
    private readonly passwordService: PasswordService,
  ) {}

  @Post("login")
  @Public()
  @ExemptFromLicenseGuard()
  @ApiOperation({ summary: "§2.1 staff login — returns a session directly, or a 2FA pre-auth token" })
  async login(@Body() dto: LoginDto, @Req() req: AuthenticatedRequest) {
    return this.authService.login(dto.identifier, dto.password, extractIp(req), extractUserAgent(req));
  }

  @Post("2fa/verify")
  @Public()
  @ExemptFromLicenseGuard()
  @ApiOperation({ summary: "Consume a pre-auth token + TOTP code, completing login" })
  async verify2fa(@Body() dto: TwoFactorVerifyDto) {
    return this.twoFactorService.verify(dto.preauthToken, dto.code);
  }

  @Post("2fa/enroll")
  @ApiOperation({ summary: "Begin 2FA enrollment — returns an otpauth URI + manual key" })
  async enroll2fa(@Req() req: AuthenticatedRequest) {
    return this.twoFactorService.enroll(requireUserId(req));
  }

  @Post("2fa/activate")
  @ApiOperation({ summary: "Activate 2FA by verifying one code — returns one-time recovery codes" })
  async activate2fa(@Body() dto: TwoFactorCodeDto, @Req() req: AuthenticatedRequest) {
    return this.twoFactorService.activateEnroll(requireUserId(req), dto.code);
  }

  @Post("2fa/disable")
  @ApiOperation({ summary: "Disable 2FA (requires a valid TOTP or recovery code)" })
  async disable2fa(@Body() dto: TwoFactorCodeDto, @Req() req: AuthenticatedRequest) {
    await this.twoFactorService.disable(requireUserId(req), dto.code);
    return { disabled: true };
  }

  @Post("refresh")
  @Public()
  @ExemptFromLicenseGuard()
  @ApiOperation({ summary: "Rotate a refresh token; reuse of an already-rotated token revokes the whole session family" })
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post("logout")
  @ExemptFromLicenseGuard()
  @ApiOperation({ summary: "Revoke the current session" })
  async logout(@Req() req: AuthenticatedRequest) {
    await this.authService.logout(requireSessionId(req));
    return { loggedOut: true };
  }

  @Post("otp/request")
  @Public()
  @ExemptFromLicenseGuard()
  @ApiOperation({ summary: "FR-AUTH-013.1 — send a 6-digit OTP to a parent's phone" })
  @ApiResponse({ status: 201 })
  async requestOtp(@Body() dto: OtpRequestDto, @Req() req: AuthenticatedRequest) {
    return this.otpService.requestOtp(dto.phone, extractIp(req));
  }

  @Post("otp/verify")
  @Public()
  @ExemptFromLicenseGuard()
  @ApiOperation({ summary: "Verify a parent OTP and issue a parent-scoped session" })
  async verifyOtp(@Body() dto: OtpVerifyDto, @Req() req: AuthenticatedRequest) {
    return this.otpService.verifyOtp(dto.phone, dto.code, extractIp(req), extractUserAgent(req));
  }

  @Post("password/change")
  @ApiOperation({ summary: "Self-service password change (requires current password)" })
  async changePassword(@Body() dto: ChangePasswordDto, @Req() req: AuthenticatedRequest) {
    await this.passwordService.changePassword(requireUserId(req), dto.currentPassword, dto.newPassword);
    return { changed: true };
  }

  @Post("password/forgot")
  @Public()
  @ApiOperation({ summary: "Request a password reset token (uniform response — no user enumeration)" })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.passwordService.forgotPassword(dto.identifier);
  }

  @Post("password/reset")
  @Public()
  @ApiOperation({ summary: "Reset password with a token; invalidates all sessions for that user" })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.passwordService.resetPassword(dto.token, dto.newPassword);
    return { reset: true };
  }
}

function requireUserId(req: AuthenticatedRequest): string {
  if (!req.user) {
    throw new AuthenticationException("Authentication required");
  }
  return req.user.sub;
}

function requireSessionId(req: AuthenticatedRequest): string {
  if (!req.user) {
    throw new AuthenticationException("Authentication required");
  }
  return req.user.sid;
}

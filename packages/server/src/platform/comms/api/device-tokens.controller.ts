import { Body, Controller, Delete, Get, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { DeviceTokensService } from "../application/device-tokens.service";
import { CommDeviceTokenEntity } from "../domain/comm-device-token.entity";
import { DeviceTokenResponseDto } from "./dto/device-token-response.dto";
import { RegisterDeviceTokenDto } from "./dto/register-device-token.dto";
import { UnregisterDeviceTokenDto } from "./dto/unregister-device-token.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: CommDeviceTokenEntity): DeviceTokenResponseDto {
  const { user: _user, ...view } = entity;
  return view;
}

function requireUserId(req: AuthenticatedRequest): string {
  if (!req.user) {
    throw new AuthenticationException("Authentication required");
  }
  return req.user.sub;
}

/**
 * Self-service only — register/unregister/list the authenticated caller's
 * own push tokens. `userId` always comes from the JWT (never the request
 * body), so no `@RequirePermission` guard is needed beyond being
 * authenticated (mirrors `AuthController`'s self-service endpoints, e.g.
 * `password/change`, which also carry no `@RequirePermission`).
 */
@ApiTags("comms-device-tokens")
@Controller("comms/device-tokens")
export class DeviceTokensController {
  constructor(private readonly deviceTokensService: DeviceTokensService) {}

  @Post()
  @ApiOperation({ summary: "Register (or refresh) the caller's own push token" })
  @ApiResponse({ status: 201, type: DeviceTokenResponseDto })
  async register(
    @Body() dto: RegisterDeviceTokenDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<DeviceTokenResponseDto> {
    const userId = requireUserId(req);
    return toView(await this.deviceTokensService.register({ userId, ...dto }, userId));
  }

  @Delete()
  @ApiOperation({ summary: "Unregister one of the caller's own push tokens" })
  @ApiResponse({ status: 200 })
  async unregister(@Body() dto: UnregisterDeviceTokenDto, @Req() req: AuthenticatedRequest): Promise<{ deleted: true }> {
    const userId = requireUserId(req);
    await this.deviceTokensService.unregisterOwnToken(userId, dto.token);
    return { deleted: true };
  }

  @Get()
  @ApiOperation({ summary: "List the caller's own registered push tokens" })
  @ApiResponse({ status: 200, type: [DeviceTokenResponseDto] })
  async listMine(@Req() req: AuthenticatedRequest): Promise<DeviceTokenResponseDto[]> {
    const userId = requireUserId(req);
    return (await this.deviceTokensService.listByUser(userId)).map(toView);
  }
}

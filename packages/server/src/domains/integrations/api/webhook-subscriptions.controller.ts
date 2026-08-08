import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { WebhookSubscriptionsService } from "../application/webhook-subscriptions.service";
import { IntgWebhookSubscriptionEntity } from "../domain/intg-webhook-subscription.entity";
import {
  CreateWebhookSubscriptionDto,
  DisableWebhookSubscriptionDto,
  RotateWebhookSecretDto,
  UpdateWebhookSubscriptionDto,
  WebhookSubscriptionResponseDto,
} from "./dto/webhook-subscription.dto";
import { AuthenticatedRequest } from "./request-context";

/** Never includes `secretEnc`/a decrypted secret — see `WebhookSubscriptionsService`'s own class doc comment. */
function toView(entity: IntgWebhookSubscriptionEntity): WebhookSubscriptionResponseDto {
  return {
    id: entity.id,
    url: entity.url,
    events: entity.events,
    isActive: entity.isActive,
    disabledReason: entity.disabledReason,
    failureStreakStartedAt: entity.failureStreakStartedAt ? entity.failureStreakStartedAt.toISOString() : null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`WebhookSubscriptionsController.${action}: no authenticated user on request`);
  return userId;
}

/** `intg_webhook_subscription` CRUD (FR-INTG-007.1). */
@ApiTags("integrations-webhook-subscriptions")
@Controller("integrations/webhook-subscriptions")
export class WebhookSubscriptionsController {
  constructor(private readonly webhookSubscriptionsService: WebhookSubscriptionsService) {}

  @Post()
  @RequirePermission("integrations:webhook:manage")
  @ApiOperation({ summary: "Create a webhook subscription — secret is AES-256-GCM encrypted at rest" })
  @ApiResponse({ status: 201, type: WebhookSubscriptionResponseDto })
  async create(@Body() dto: CreateWebhookSubscriptionDto, @Req() req: AuthenticatedRequest): Promise<WebhookSubscriptionResponseDto> {
    const actorId = requireUserId(req, "create");
    const row = await this.webhookSubscriptionsService.create(dto, actorId);
    return toView(row);
  }

  @Get()
  @RequirePermission("integrations:webhook:view")
  @ApiOperation({ summary: "List webhook subscriptions" })
  @ApiResponse({ status: 200, type: [WebhookSubscriptionResponseDto] })
  async list(): Promise<WebhookSubscriptionResponseDto[]> {
    const rows = await this.webhookSubscriptionsService.list();
    return rows.map(toView);
  }

  @Get(":id")
  @RequirePermission("integrations:webhook:view")
  @ApiOperation({ summary: "Get a webhook subscription by id" })
  @ApiResponse({ status: 200, type: WebhookSubscriptionResponseDto })
  async findOne(@Param("id") id: string): Promise<WebhookSubscriptionResponseDto> {
    return toView(await this.webhookSubscriptionsService.findByIdOrFail(id));
  }

  @Patch(":id")
  @RequirePermission("integrations:webhook:manage")
  @ApiOperation({ summary: "Update a webhook subscription's url/events" })
  @ApiResponse({ status: 200, type: WebhookSubscriptionResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateWebhookSubscriptionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<WebhookSubscriptionResponseDto> {
    const actorId = requireUserId(req, "update");
    return toView(await this.webhookSubscriptionsService.update(id, dto, actorId));
  }

  @Post(":id/rotate-secret")
  @RequirePermission("integrations:webhook:manage")
  @ApiOperation({ summary: "Rotate a webhook subscription's HMAC signing secret" })
  @ApiResponse({ status: 200, type: WebhookSubscriptionResponseDto })
  async rotateSecret(
    @Param("id") id: string,
    @Body() dto: RotateWebhookSecretDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<WebhookSubscriptionResponseDto> {
    const actorId = requireUserId(req, "rotateSecret");
    return toView(await this.webhookSubscriptionsService.rotateSecret(id, dto.secret, actorId));
  }

  @Post(":id/disable")
  @RequirePermission("integrations:webhook:manage")
  @ApiOperation({ summary: "Manually disable a webhook subscription" })
  @ApiResponse({ status: 200, type: WebhookSubscriptionResponseDto })
  async disable(
    @Param("id") id: string,
    @Body() dto: DisableWebhookSubscriptionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<WebhookSubscriptionResponseDto> {
    const actorId = requireUserId(req, "disable");
    return toView(await this.webhookSubscriptionsService.disable(id, dto.reason, actorId));
  }

  @Post(":id/enable")
  @RequirePermission("integrations:webhook:manage")
  @ApiOperation({ summary: "Re-enable a disabled webhook subscription and clear its failure streak" })
  @ApiResponse({ status: 200, type: WebhookSubscriptionResponseDto })
  async enable(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<WebhookSubscriptionResponseDto> {
    const actorId = requireUserId(req, "enable");
    return toView(await this.webhookSubscriptionsService.enable(id, actorId));
  }
}

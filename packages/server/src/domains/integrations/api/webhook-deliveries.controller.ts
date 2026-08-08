import { Controller, Get, Param, Post, Query } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { WebhookDeliveryService } from "../application/webhook-delivery.service";
import { IntgWebhookDeliveryRepository } from "../infrastructure/intg-webhook-delivery.repository";
import { IntgWebhookDeliveryEntity } from "../domain/intg-webhook-delivery.entity";
import {
  ListWebhookDeliveriesQueryDto,
  ListWebhookDeliveriesResponseDto,
  ProcessDueResponseDto,
  WebhookDeliveryResponseDto,
} from "./dto/webhook-delivery.dto";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

function toView(entity: IntgWebhookDeliveryEntity): WebhookDeliveryResponseDto {
  return {
    id: entity.id,
    subscriptionId: entity.subscriptionId,
    eventType: entity.eventType,
    payload: entity.payload,
    attempt: entity.attempt,
    status: entity.status,
    responseCode: entity.responseCode,
    nextRetryAt: entity.nextRetryAt.toISOString(),
    createdAt: entity.createdAt.toISOString(),
  };
}

/**
 * `intg_webhook_delivery` — list/get plus two MANUAL trigger endpoints
 * (`WebhookDeliveryService`'s own class doc comment: no scheduler/worker
 * exists anywhere in this codebase, so both retry paths are
 * operator-initiated). The static `process-due` route is declared BEFORE
 * the dynamic `:id` routes below it — the Module 18 wildcard-vs-static route
 * collision this task brief flags is not actually reachable here (different
 * HTTP methods/path shapes, `POST /process-due` vs `GET /:id`/`POST
 * /:id/retry`), but the ordering is kept deliberately safe regardless.
 */
@ApiTags("integrations-webhook-deliveries")
@Controller("integrations/webhook-deliveries")
export class WebhookDeliveriesController {
  constructor(
    private readonly webhookDeliveryService: WebhookDeliveryService,
    private readonly webhookDeliveryRepository: IntgWebhookDeliveryRepository,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get()
  @RequirePermission("integrations:webhook:view")
  @ApiOperation({ summary: "List/filter intg_webhook_delivery rows (subscriptionId/status), paginated" })
  @ApiResponse({ status: 200, type: ListWebhookDeliveriesResponseDto })
  async list(@Query() query: ListWebhookDeliveriesQueryDto): Promise<ListWebhookDeliveriesResponseDto> {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const [items, total] = await this.webhookDeliveryRepository.list({
      subscriptionId: query.subscriptionId,
      status: query.status,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return {
      items: items.map(toView),
      meta: { total, page, pageSize, pageCount: pageSize > 0 ? Math.ceil(total / pageSize) : 0 },
    };
  }

  @Post("process-due")
  @RequirePermission("integrations:webhook:retry")
  @ApiOperation({ summary: "Manual batch trigger — findDueForRetry() + attemptDelivery() each, partial-failure-tolerant. No scheduler exists; this is the operator's manual substitute." })
  @ApiResponse({ status: 200, type: ProcessDueResponseDto })
  async processDue(): Promise<ProcessDueResponseDto> {
    return runInTransaction(this.dataSource, (manager) => this.webhookDeliveryService.processDue(manager));
  }

  @Get(":id")
  @RequirePermission("integrations:webhook:view")
  @ApiOperation({ summary: "Get a webhook delivery by id" })
  @ApiResponse({ status: 200, type: WebhookDeliveryResponseDto })
  async findOne(@Param("id") id: string): Promise<WebhookDeliveryResponseDto> {
    return toView(await this.webhookDeliveryRepository.findByIdOrFail(id));
  }

  @Post(":id/retry")
  @RequirePermission("integrations:webhook:retry")
  @ApiOperation({ summary: "Manually attempt one delivery immediately, regardless of next_retry_at" })
  @ApiResponse({ status: 200, type: WebhookDeliveryResponseDto })
  async retry(@Param("id") id: string): Promise<WebhookDeliveryResponseDto> {
    const delivery = await runInTransaction(this.dataSource, (manager) => this.webhookDeliveryService.attemptDelivery(manager, id));
    return toView(delivery);
  }
}

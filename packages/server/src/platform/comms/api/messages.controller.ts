import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { NotificationsService } from "../application/notifications.service";
import { CommMessageEntity } from "../domain/comm-message.entity";
import { ListMessagesQueryDto } from "./dto/list-messages-query.dto";
import { MessageResponseDto } from "./dto/message-response.dto";

function toView(entity: CommMessageEntity): MessageResponseDto {
  const { broadcast: _broadcast, costAmount, ...rest } = entity;
  return { ...rest, costAmount: costAmount ? costAmount.toDecimalString() : null } as unknown as MessageResponseDto;
}

export interface ListMessagesResponseDto {
  items: MessageResponseDto[];
  meta: { total: number; page: number; pageSize: number; pageCount: number };
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

/**
 * READ-ONLY — list/filter `comm_message` by status/entity/broadcast. No
 * mutation endpoint exists here: sends only ever happen via
 * `NotificationsService.send()` (an internal service call from other
 * modules, or `BroadcastsService.send()`'s fan-out), never a direct HTTP
 * write to this table (task brief for this module).
 */
@ApiTags("comms-messages")
@Controller("comms/messages")
export class MessagesController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @RequirePermission("comms:message:view")
  @ApiOperation({ summary: "List/filter comm_message rows (status/entity/broadcast), paginated" })
  @ApiResponse({ status: 200 })
  async list(@Query() query: ListMessagesQueryDto): Promise<ListMessagesResponseDto> {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const [items, total] = await this.notificationsService.list({
      status: query.status,
      entityType: query.entityType,
      entityId: query.entityId,
      broadcastId: query.broadcastId,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      items: items.map(toView),
      meta: { total, page, pageSize, pageCount: pageSize > 0 ? Math.ceil(total / pageSize) : 0 },
    };
  }
}

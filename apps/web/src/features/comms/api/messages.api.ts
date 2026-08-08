import type { MessageResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import { optionalQuery } from "./query-params";

/** `comm_message.status` — no `CommMessageStatus` type is re-exported through `@klickit/contracts` (it's a bare `packages/server`-only string-literal union, `MESSAGE_STATUSES` in `list-messages-query.dto.ts`/`message-response.dto.ts`), so `MessageResponseDto["status"]` is the closest real source of truth, same reasoning `channel-badge.tsx` already documents for `CommChannel`. */
export type MessageStatus = MessageResponseDto["status"];

/**
 * Thin wrapper over `MessagesController`
 * (`packages/server/src/platform/comms/api/messages.controller.ts`) —
 * READ-ONLY, `comms:message:view` covers the one route. No mutation endpoint
 * exists anywhere for `comm_message` (sends only ever happen internally via
 * `NotificationsService.send()`, confirmed by reading that controller's own
 * doc comment) — this file therefore has no `create*`/`update*`/`delete*`.
 *
 * **A real, confirmed codegen gap on the list response envelope** — a
 * different flavor of the class of gap `templates.api.ts`/`broadcasts.api.ts`
 * document for request bodies. `MessagesController.list()` returns a plain
 * `interface ListMessagesResponseDto` declared LOCALLY in the controller
 * file itself (not a class in a `*.dto.ts` file), and its
 * `@ApiResponse({ status: 200 })` carries no `type` — confirmed by reading
 * `messages.controller.ts` directly. `@klickit/contracts`' codegen only
 * scans `*.dto.ts` files (see `packages/contracts/codegen/generate-zod-
 * schemas.ts`'s own header comment), so this envelope shape was never
 * picked up there either (unlike `ListWebhookDeliveriesResponseDto`, which
 * IS a real class inside `webhook-delivery.dto.ts` and so DOES have a real
 * generated zod schema + a real `content` type at this endpoint's generated
 * OpenAPI operation — confirmed by comparing the two directly). The
 * generated `MessagesController_list` operation therefore has
 * `content?: never` for its 200 response. Fixed by hand-declaring the same
 * shape here, reusing the real `MessageResponseDto` from `@klickit/contracts`
 * for `items` (that DTO itself has no gap) — `unwrapApiResult`'s `data`
 * parameter is already typed `unknown` (see that helper's own doc comment),
 * so no `as unknown as` cast is needed at this call site, unlike the
 * request-body-side gaps `templates.api.ts`/`broadcasts.api.ts` document.
 */
export interface ListMessagesResponseDto {
  items: MessageResponseDto[];
  meta: { total: number; page: number; pageSize: number; pageCount: number };
}

export interface ListMessagesParams {
  status?: MessageStatus;
  entityType?: string;
  entityId?: string;
  broadcastId?: string;
  page?: number;
  pageSize?: number;
}

export async function listMessages(params: ListMessagesParams = {}): Promise<ListMessagesResponseDto> {
  return unwrapApiResult<ListMessagesResponseDto>(
    await apiClient.GET("/api/v1/comms/messages", {
      params: {
        query: optionalQuery({
          status: params.status,
          entityType: params.entityType,
          entityId: params.entityId,
          broadcastId: params.broadcastId,
          page: params.page,
          pageSize: params.pageSize,
        }),
      },
    }),
  );
}

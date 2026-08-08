import { BaseDomainEvent } from "../../../shared/events/domain-event";
import { CommChannel } from "../domain/comm-template.entity";

export interface MessageSentPayload extends Record<string, unknown> {
  messageId: string;
  channel: CommChannel;
  recipient: string;
  templateEvent: string | null;
  broadcastId: string | null;
  providerRef: string | null;
}

/**
 * Published (via the transactional outbox) whenever `NotificationsService.send()`
 * successfully transitions a `comm_message` row to `SENT` — never for
 * `FAILED`/`OPTED_OUT` outcomes (there's nothing to announce). No in-process
 * handler subscribes yet; a future delivery-receipt/read-model consumer
 * (e.g. the WebSocket `notification.new` room, docs/phase-3/02-communication-authentication.md
 * §1.4) is the eventual consumer.
 */
export class MessageSentEvent extends BaseDomainEvent<MessageSentPayload> {
  readonly eventType = "comms.message.sent";
  readonly aggregateType = "comm_message";

  constructor(messageId: string, payload: MessageSentPayload) {
    super(messageId, payload);
  }
}

import { BaseDomainEvent } from "../../../shared/events/domain-event";

export interface BroadcastSentPayload extends Record<string, unknown> {
  broadcastId: string;
  recipientCount: number;
  sentCount: number;
  actorId: string | null;
}

/**
 * Published (via the transactional outbox) whenever `BroadcastsService.send()`
 * finishes fanning a broadcast out to `comm_message` rows and flips
 * `comm_broadcast.status` to `SENT`. No in-process handler subscribes yet.
 */
export class BroadcastSentEvent extends BaseDomainEvent<BroadcastSentPayload> {
  readonly eventType = "comms.broadcast.sent";
  readonly aggregateType = "comm_broadcast";

  constructor(broadcastId: string, payload: BroadcastSentPayload) {
    super(broadcastId, payload);
  }
}

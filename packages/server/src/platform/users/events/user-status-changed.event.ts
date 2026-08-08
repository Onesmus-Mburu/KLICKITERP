import { BaseDomainEvent } from "../../../shared/events/domain-event";
import { UsrUserStatus } from "../domain/usr-user.entity";

export interface UserStatusChangedPayload extends Record<string, unknown> {
  fromStatus: UsrUserStatus;
  toStatus: UsrUserStatus;
  actorId: string | null;
}

/**
 * Published (via the transactional outbox) whenever a user crosses the
 * INVITED/ACTIVE/SUSPENDED/DEACTIVATED state machine. No in-process handler
 * subscribes yet — this is the emission-point stub the module anatomy
 * standard calls for; BR-SEC-02 ("deactivated users removed from approval
 * chains") is a Module 15 (Approvals) concern that will subscribe once that
 * module exists.
 */
export class UserStatusChangedEvent extends BaseDomainEvent<UserStatusChangedPayload> {
  readonly eventType = "users.user.status_changed";
  readonly aggregateType = "usr_user";

  constructor(userId: string, payload: UserStatusChangedPayload) {
    super(userId, payload);
  }
}

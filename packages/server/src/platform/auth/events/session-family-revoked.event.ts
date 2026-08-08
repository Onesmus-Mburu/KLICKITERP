import { BaseDomainEvent } from "../../../shared/events/domain-event";

export interface SessionFamilyRevokedPayload extends Record<string, unknown> {
  familyId: string;
  reason: string;
}

/**
 * FR-AUTH-002.1 — published when a refresh-token family is revoked
 * (reuse detection, logout-all, password reset). The security-notification
 * send-to-user is a `comms` module concern (Module 5, not built yet); this
 * event is the escape hatch that module subscribes to once it exists.
 */
export class SessionFamilyRevokedEvent extends BaseDomainEvent<SessionFamilyRevokedPayload> {
  readonly eventType = "auth.session_family.revoked";
  readonly aggregateType = "usr_user";

  constructor(userId: string, payload: SessionFamilyRevokedPayload) {
    super(userId, payload);
  }
}

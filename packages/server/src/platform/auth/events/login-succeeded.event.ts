import { BaseDomainEvent } from "../../../shared/events/domain-event";

export interface LoginSucceededPayload extends Record<string, unknown> {
  sessionId: string;
  ip: string;
  userAgent: string;
}

/** Published on every successful login (password+2FA, or parent OTP) — future comms/dashboard read-models subscribe. */
export class LoginSucceededEvent extends BaseDomainEvent<LoginSucceededPayload> {
  readonly eventType = "auth.login.succeeded";
  readonly aggregateType = "usr_user";

  constructor(userId: string, payload: LoginSucceededPayload) {
    super(userId, payload);
  }
}

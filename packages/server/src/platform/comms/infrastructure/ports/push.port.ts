import { SendResult } from "./send-result";

/**
 * Ports & adapters boundary (docs/phase-3/02-communication-authentication.md
 * §1.5: `PushPort ── FcmAdapter`). `meta?.title` carries an optional push
 * notification title distinct from the body (FCM's `notification.title`).
 */
export interface PushPort {
  send(recipient: string, body: string, meta?: Record<string, unknown>): Promise<SendResult>;
}

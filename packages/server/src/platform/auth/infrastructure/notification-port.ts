import { Injectable, Logger } from "@nestjs/common";

export interface NotificationMessage {
  to: string;
  channel: "SMS" | "EMAIL";
  subject?: string;
  body: string;
}

/**
 * Minimal local port so auth's OTP/password-reset/lockout-notice flows have
 * somewhere to send through without depending on the `comms` module, which
 * doesn't exist yet (Module 5 per docs/phase-5/00-module-plan.md). Once
 * `comms` lands, a real adapter implementing this same interface (backed by
 * `SmsPort`/`MailPort`) replaces `LogOnlyAdapter` via DI — call sites in
 * `auth`'s services never change.
 */
export interface NotificationPort {
  send(message: NotificationMessage): Promise<void>;
}

export const NOTIFICATION_PORT = Symbol("NOTIFICATION_PORT");

@Injectable()
export class LogOnlyAdapter implements NotificationPort {
  private readonly logger = new Logger(LogOnlyAdapter.name);

  async send(message: NotificationMessage): Promise<void> {
    this.logger.log(`[notification stub] ${message.channel} -> ${message.to}: ${message.body}`);
  }
}

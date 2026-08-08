import { SendResult } from "./send-result";

/**
 * Ports & adapters boundary (docs/phase-3/02-communication-authentication.md
 * §1.5: `SmsPort ─── AfricasTalkingAdapter | GenericHttpSmsAdapter |
 * (WhatsAppAdapter: reserved)`). This module ships `GenericHttpSmsAdapter`
 * (a real, provider-agnostic HTTP adapter) and `LogOnlyAdapter` (safe
 * default) — a dedicated Africa's Talking adapter is a future addition
 * behind this same interface, not a rewrite of any caller.
 */
export interface SmsPort {
  send(recipient: string, body: string, meta?: Record<string, unknown>): Promise<SendResult>;
}

import { Injectable, Logger } from "@nestjs/common";
import { generateUuidV7 } from "../../../../shared/ids/uuid7";
import { MailPort } from "../ports/mail.port";
import { PushPort } from "../ports/push.port";
import { SendResult } from "../ports/send-result";
import { SmsPort } from "../ports/sms.port";

/**
 * Safe default implementing all three ports at once — mirrors the
 * `LogOnlyAdapter` pattern already established in `platform/auth`'s
 * `infrastructure/notification-port.ts` (which exists only because `comms`
 * didn't exist yet when auth's OTP/password-reset flows were built), but
 * this is the real comms module's version: `AdapterResolverService` falls
 * back to this whenever no `set_integration_config` row of the matching
 * kind is enabled, and it's what every channel this module doesn't yet have
 * a real adapter for (WHATSAPP, INAPP) always uses. Logs and returns a
 * synthetic `providerRef` so callers see a normal, successful `SENT` result
 * end-to-end even with zero configured integrations.
 */
@Injectable()
export class LogOnlyAdapter implements SmsPort, MailPort, PushPort {
  private readonly logger = new Logger(LogOnlyAdapter.name);

  async send(recipient: string, body: string, meta?: Record<string, unknown>): Promise<SendResult> {
    this.logger.log(`[comms log-only] -> ${recipient}: ${body}${meta ? ` (meta=${JSON.stringify(meta)})` : ""}`);
    return { providerRef: `log-${generateUuidV7()}` };
  }
}

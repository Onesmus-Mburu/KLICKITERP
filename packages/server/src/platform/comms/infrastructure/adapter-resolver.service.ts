import { Injectable } from "@nestjs/common";
import { IntegrationConfigService, SetIntegrationConfigEntity, SetIntegrationKind } from "../../settings";
import { CommChannel } from "../domain/comm-template.entity";
import { FcmPushAdapter, FcmPushConfig } from "./adapters/fcm-push.adapter";
import { GenericHttpSmsAdapter, GenericHttpSmsConfig } from "./adapters/generic-http-sms.adapter";
import { LogOnlyAdapter } from "./adapters/log-only.adapter";
import { SmtpMailAdapter, SmtpMailConfig } from "./adapters/smtp-mail.adapter";
import { MailPort } from "./ports/mail.port";
import { PushPort } from "./ports/push.port";
import { SmsPort } from "./ports/sms.port";

interface CacheEntry<TPort> {
  configId: string;
  adapter: TPort;
}

/**
 * Given a channel, asks `platform/settings`' `IntegrationConfigService` (its
 * public service, never its repositories — module-deps.json's
 * `platform/comms` entry) for the highest-priority enabled config of the
 * matching kind (SMS -> SMS, EMAIL -> SMTP, PUSH -> FCM, per
 * docs/phase-3/02-communication-authentication.md §1.5) and returns the
 * matching real adapter, constructed from the decrypted config. Falls back
 * to `LogOnlyAdapter` when no config of that kind is enabled/configured, or
 * for WHATSAPP/INAPP (no adapter kind exists for either yet — WhatsApp is
 * explicitly "reserved" per §1.5, and INAPP has no outbound transport at
 * all, it's read entirely from `comm_message` rows by the future
 * WebSocket/notification-badge consumer).
 *
 * Adapter instances are cached per channel, keyed by the resolved config's
 * id, so a stable config doesn't pay SMTP-transporter/Firebase-app
 * construction cost on every single send; re-resolves (and disposes the
 * outgoing `FcmPushAdapter`'s Firebase app, if any) the moment the enabled
 * config changes.
 */
@Injectable()
export class AdapterResolverService {
  private smsCache: CacheEntry<SmsPort> | null = null;
  private mailCache: CacheEntry<MailPort> | null = null;
  private pushCache: CacheEntry<PushPort> | null = null;

  constructor(
    private readonly integrationConfigService: IntegrationConfigService,
    private readonly logOnlyAdapter: LogOnlyAdapter,
  ) {}

  async resolve(channel: CommChannel): Promise<SmsPort | MailPort | PushPort> {
    switch (channel) {
      case "SMS":
        return this.resolveSms();
      case "EMAIL":
        return this.resolveMail();
      case "PUSH":
        return this.resolvePush();
      case "WHATSAPP":
      case "INAPP":
        return this.logOnlyAdapter;
      /* istanbul ignore next -- exhaustive over CommChannel, unreachable at the type level */
      default: {
        const exhaustive: never = channel;
        throw new Error(`Unhandled comm channel: ${String(exhaustive)}`);
      }
    }
  }

  async resolveSms(): Promise<SmsPort> {
    const enabled = await this.findEnabled("SMS");
    if (!enabled) return this.logOnlyAdapter;
    if (this.smsCache?.configId === enabled.id) return this.smsCache.adapter;

    const config = (await this.integrationConfigService.getDecryptedConfig(
      enabled.id,
    )) as unknown as GenericHttpSmsConfig;
    const adapter = new GenericHttpSmsAdapter(config);
    this.smsCache = { configId: enabled.id, adapter };
    return adapter;
  }

  async resolveMail(): Promise<MailPort> {
    const enabled = await this.findEnabled("SMTP");
    if (!enabled) return this.logOnlyAdapter;
    if (this.mailCache?.configId === enabled.id) return this.mailCache.adapter;

    const config = (await this.integrationConfigService.getDecryptedConfig(enabled.id)) as unknown as SmtpMailConfig;
    const adapter = new SmtpMailAdapter(config);
    this.mailCache = { configId: enabled.id, adapter };
    return adapter;
  }

  async resolvePush(): Promise<PushPort> {
    const enabled = await this.findEnabled("FCM");
    if (!enabled) return this.logOnlyAdapter;
    if (this.pushCache?.configId === enabled.id) return this.pushCache.adapter;

    const previous = this.pushCache?.adapter;
    if (previous instanceof FcmPushAdapter) {
      await previous.dispose().catch(() => undefined);
    }

    const config = (await this.integrationConfigService.getDecryptedConfig(enabled.id)) as unknown as FcmPushConfig;
    const adapter = new FcmPushAdapter(config);
    this.pushCache = { configId: enabled.id, adapter };
    return adapter;
  }

  private async findEnabled(kind: SetIntegrationKind): Promise<SetIntegrationConfigEntity | undefined> {
    const configs = await this.integrationConfigService.list();
    return configs.filter((c) => c.kind === kind && c.isEnabled).sort((a, b) => b.priority - a.priority)[0];
  }
}

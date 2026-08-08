import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { OutboxWriterService } from "../../../shared/events/outbox-writer.service";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { AdapterResolverService } from "../infrastructure/adapter-resolver.service";
import { MessageSentEvent } from "../events/message-sent.event";
import { CommChannel } from "../domain/comm-template.entity";
import { CommMessageEntity } from "../domain/comm-message.entity";
import { CommMessageRepository, ListMessagesOptions } from "../infrastructure/comm-message.repository";
import { OptoutsService } from "./optouts.service";
import { TemplatesService } from "./templates.service";

export interface SendMessageInput {
  channel: CommChannel;
  recipient: string;
  /** When given, the message body/subject is rendered via `TemplatesService` — otherwise `body` (and optional `subject`) is sent verbatim. */
  eventCode?: string;
  locale?: string;
  variables?: Record<string, string>;
  body?: string;
  subject?: string;
  entityType?: string | null;
  entityId?: string | null;
  broadcastId?: string | null;
  /** When given, `OptoutsService.isOptedOut(guardianId, channel, optOutScope)` gates the send — a hit records `OPTED_OUT` and never calls the adapter. */
  guardianIdForOptOutCheck?: string;
  /** Defaults to `'ALL'` — the opt-out scope checked against `comm_optout.scope`. */
  optOutScope?: string;
}

const DEFAULT_OPT_OUT_SCOPE = "ALL";

/**
 * Core send orchestrator (docs/phase-3/02-communication-authentication.md
 * §1.2 names `comms.sms`/`comms.email`/`comms.push` BullMQ queues in the
 * target architecture, but no worker app/BullMQ wiring exists in this repo
 * yet — see this module's task brief). `send()` therefore calls the
 * resolved port adapter directly, synchronously, in the request/caller's
 * process, and writes every `comm_message` status transition itself:
 *
 *  1. Render (via `TemplatesService`, if `eventCode` given) or use the raw
 *     `body`/`subject`.
 *  2. If `guardianIdForOptOutCheck` is given and opted out for this
 *     `(channel, optOutScope)`: write a `comm_message` row with
 *     `status='OPTED_OUT'` and return — the adapter is never called.
 *  3. Otherwise: INSERT the `comm_message` row FIRST with `status='QUEUED'`
 *     (so a row exists even if the process crashes before the adapter call
 *     returns), then call the adapter. On success, update the same row to
 *     `SENT` + `sentAt` + `providerRef`/`cost`/`segments`. On failure,
 *     update it to `FAILED` + `error` — the adapter error is swallowed here,
 *     never rethrown to the caller: a failed send is a valid recorded
 *     outcome for this append-mostly audit log, not an exception (task
 *     brief for this module). Real async queueing/retry (the `comms.*`
 *     BullMQ queues) is a future worker-module concern.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly messageRepository: CommMessageRepository,
    private readonly templatesService: TemplatesService,
    private readonly optoutsService: OptoutsService,
    private readonly adapterResolver: AdapterResolverService,
    private readonly outboxWriter: OutboxWriterService,
  ) {}

  async send(input: SendMessageInput): Promise<CommMessageEntity> {
    const { subject, body } = await this.resolveContent(input);

    if (input.guardianIdForOptOutCheck) {
      const optedOut = await this.optoutsService.isOptedOut(
        input.guardianIdForOptOutCheck,
        input.channel,
        input.optOutScope ?? DEFAULT_OPT_OUT_SCOPE,
      );
      if (optedOut) {
        return this.messageRepository.create({
          channel: input.channel,
          recipient: input.recipient,
          templateEvent: input.eventCode ?? null,
          broadcastId: input.broadcastId ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          bodyRendered: body,
          status: "OPTED_OUT",
          queuedAt: new Date(),
        });
      }
    }

    let message = await this.messageRepository.create({
      channel: input.channel,
      recipient: input.recipient,
      templateEvent: input.eventCode ?? null,
      broadcastId: input.broadcastId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      bodyRendered: body,
      status: "QUEUED",
      queuedAt: new Date(),
    });

    try {
      const adapter = await this.adapterResolver.resolve(input.channel);
      const result = await adapter.send(input.recipient, body, subject ? { subject } : undefined);

      message.status = "SENT";
      message.sentAt = new Date();
      message.providerRef = result.providerRef ?? null;
      message.costAmount = result.cost ?? null;
      message.segments = result.segments ?? null;

      const toPersist = message;
      message = await runInTransaction(this.dataSource, async (manager) => {
        const persisted = await this.messageRepository.save(toPersist, manager);
        await this.outboxWriter.write(
          manager,
          new MessageSentEvent(persisted.id, {
            messageId: persisted.id,
            channel: persisted.channel,
            recipient: persisted.recipient,
            templateEvent: persisted.templateEvent,
            broadcastId: persisted.broadcastId,
            providerRef: persisted.providerRef,
          }),
        );
        return persisted;
      });
    } catch (error) {
      this.logger.warn(`Send failed: ${input.channel} -> ${input.recipient}: ${(error as Error).message}`);
      message.status = "FAILED";
      message.error = (error as Error).message;
      message = await this.messageRepository.save(message);
    }

    return message;
  }

  /** Backs the READ-ONLY `messages.controller.ts` list endpoint — no mutation endpoint exists for `comm_message` (task brief for this module). */
  async list(options: ListMessagesOptions): Promise<[CommMessageEntity[], number]> {
    return this.messageRepository.list(options);
  }

  private async resolveContent(input: SendMessageInput): Promise<{ subject?: string; body: string }> {
    if (input.eventCode) {
      return this.templatesService.render(input.eventCode, input.channel, input.locale ?? "en", input.variables ?? {});
    }
    if (!input.body) {
      throw new ValidationException("Either eventCode (template render) or body (raw send) is required");
    }
    return { subject: input.subject, body: input.body };
  }
}

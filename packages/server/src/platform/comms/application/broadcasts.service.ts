import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { OutboxWriterService } from "../../../shared/events/outbox-writer.service";
import { Money } from "../../../shared/money/money";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { UsersService } from "../../users";
import { BroadcastSentEvent } from "../events/broadcast-sent.event";
import { CommBroadcastEntity, CommBroadcastStatus } from "../domain/comm-broadcast.entity";
import { CommChannel } from "../domain/comm-template.entity";
import { CommBroadcastRepository } from "../infrastructure/comm-broadcast.repository";
import { DeviceTokensService } from "./device-tokens.service";
import { NotificationsService } from "./notifications.service";

export interface CreateBroadcastInput {
  title: string;
  audienceDef: AudienceDef;
  channel: CommChannel;
  body: string;
  estCostAmount?: Money;
}

/**
 * Supported `audience_def` shapes (task brief for this module) — resolved
 * against `usr_user`/`usr_user_role` via `platform/users`' `UsersService`
 * (public surface only, never its repositories). Guardian/parent audience
 * kinds (e.g. "all guardians of students in grade X") are deferred to
 * Module 8 (Students), which doesn't exist yet — `resolveAudience()` throws
 * a `ValidationException` for any `kind` other than the two below.
 */
export type AudienceDef =
  | { kind: "STAFF_ROLE"; roleId: string }
  | { kind: "EXPLICIT_USER_IDS"; userIds: string[] };

/** DRAFT -> PENDING_APPROVAL -> APPROVED -> SENDING -> SENT, or -> CANCELLED from any pre-SENDING state (task brief). */
const ALLOWED_TRANSITIONS: Record<CommBroadcastStatus, readonly CommBroadcastStatus[]> = {
  DRAFT: ["PENDING_APPROVAL", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "CANCELLED"],
  APPROVED: ["SENDING", "CANCELLED"],
  SENDING: ["SENT"],
  SENT: [],
  CANCELLED: [],
};

/**
 * CRUD for `comm_broadcast` + its status state machine. `submitForApproval()`
 * only stores/requires the caller-supplied `approval_ref` — the actual
 * approval workflow engine is Module 6 (Approvals), not built yet; this
 * service does not validate the reference against anything, it's a
 * placeholder field for that future integration (task brief).
 *
 * `send()` requires `status='APPROVED'`, resolves `audience_def` into a
 * concrete recipient list, expands one `comm_message` row per recipient
 * (via `NotificationsService.send()`, `broadcastId` set), then sets
 * `recipientCount` and transitions to `SENT`. Only `STAFF_ROLE` and
 * `EXPLICIT_USER_IDS` audience kinds are supported today (see `AudienceDef`).
 */
@Injectable()
export class BroadcastsService {
  private readonly logger = new Logger(BroadcastsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly broadcastRepository: CommBroadcastRepository,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly deviceTokensService: DeviceTokensService,
    private readonly outboxWriter: OutboxWriterService,
  ) {}

  async create(input: CreateBroadcastInput, actorId: string | null): Promise<CommBroadcastEntity> {
    return this.broadcastRepository.create({
      title: input.title,
      audienceDef: input.audienceDef,
      channel: input.channel,
      body: input.body,
      recipientCount: 0,
      estCostAmount: input.estCostAmount ?? Money.ZERO,
      status: "DRAFT",
      approvalRef: null,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async list(): Promise<CommBroadcastEntity[]> {
    return this.broadcastRepository.list();
  }

  async findByIdOrFail(id: string): Promise<CommBroadcastEntity> {
    return this.broadcastRepository.findByIdOrFail(id);
  }

  /** DRAFT -> PENDING_APPROVAL, storing the caller-supplied `approvalRef` (Module 6 concern — see class doc comment). */
  async submitForApproval(id: string, approvalRef: string, actorId: string | null): Promise<CommBroadcastEntity> {
    if (!approvalRef) {
      throw new ValidationException("approvalRef is required to submit a broadcast for approval");
    }
    const broadcast = await this.transitionTo(id, "PENDING_APPROVAL", actorId);
    broadcast.approvalRef = approvalRef;
    broadcast.updatedBy = actorId;
    return this.broadcastRepository.save(broadcast);
  }

  /** PENDING_APPROVAL -> APPROVED. Stands in for the real approval decision until Module 6 (Approvals) lands. */
  async approve(id: string, actorId: string | null): Promise<CommBroadcastEntity> {
    return this.transitionTo(id, "APPROVED", actorId);
  }

  /** Any pre-SENDING state -> CANCELLED. */
  async cancel(id: string, actorId: string | null): Promise<CommBroadcastEntity> {
    return this.transitionTo(id, "CANCELLED", actorId);
  }

  /**
   * APPROVED -> SENDING -> SENT: resolves the audience, expands one
   * `comm_message` per recipient via `NotificationsService.send()`, then
   * records `recipientCount` and flips to `SENT`. `SENDING`/`recipientCount`
   * are committed before the fan-out starts (so a crash mid-send never
   * leaves the broadcast looking untouched), while the individual message
   * sends themselves are `NotificationsService`'s own per-recipient unit of
   * work (never-throws — see that service's doc comment), so one
   * recipient's failure never aborts the rest of the fan-out. The final
   * `SENT` transition + `BroadcastSentEvent` outbox write happen together in
   * one transaction.
   */
  async send(id: string, actorId: string | null): Promise<CommBroadcastEntity> {
    const broadcast = await this.broadcastRepository.findByIdOrFail(id);
    if (broadcast.status !== "APPROVED") {
      throw new ValidationException(`Broadcast must be APPROVED to send — "${broadcast.title}" is ${broadcast.status}`, {
        broadcastId: id,
        status: broadcast.status,
      });
    }

    const recipients = await this.resolveAudience(broadcast.channel, broadcast.audienceDef as AudienceDef);

    broadcast.status = "SENDING";
    broadcast.recipientCount = recipients.length;
    broadcast.updatedBy = actorId;
    let saved = await this.broadcastRepository.save(broadcast);

    let sentCount = 0;
    for (const recipient of recipients) {
      const message = await this.notificationsService.send({
        channel: saved.channel,
        recipient,
        body: saved.body,
        broadcastId: saved.id,
        entityType: "comm_broadcast",
        entityId: saved.id,
      });
      if (message.status === "SENT") sentCount++;
    }
    this.logger.log(`Broadcast ${saved.id} sent to ${sentCount}/${recipients.length} recipients`);

    saved.status = "SENT";
    saved.updatedBy = actorId;
    saved = await runInTransaction(this.dataSource, async (manager) => {
      const persisted = await this.broadcastRepository.save(saved, manager);
      await this.outboxWriter.write(
        manager,
        new BroadcastSentEvent(persisted.id, {
          broadcastId: persisted.id,
          recipientCount: persisted.recipientCount,
          sentCount,
          actorId,
        }),
      );
      return persisted;
    });

    return saved;
  }

  /**
   * Resolves an `AudienceDef` to a concrete list of channel-appropriate
   * recipient addresses. `STAFF_ROLE`/`EXPLICIT_USER_IDS` first resolve to
   * `UsrUserEntity[]` via `UsersService`, then each user is mapped to the
   * identifier the broadcast's `channel` actually sends to:
   *  - `EMAIL` -> `user.email` (skipped if the user has none)
   *  - `SMS`/`WHATSAPP` -> `user.phone` (skipped if the user has none)
   *  - `PUSH` -> every registered `comm_device_token` for that user (zero,
   *    one, or many messages per user — a user with two devices gets two
   *    `comm_message` rows)
   *  - `INAPP` -> the user's own id (no external transport; `comm_message`
   *    rows are the delivery mechanism, read by a future WebSocket/
   *    notification-badge consumer)
   * `recipientCount` is set from this *resolved* list, not the raw
   * role/id-list size, since a role can contain users missing the contact
   * field a given channel needs.
   */
  private async resolveAudience(channel: CommChannel, audienceDef: AudienceDef): Promise<string[]> {
    const users = await this.resolveUsers(audienceDef);
    const recipients: string[] = [];

    for (const user of users) {
      switch (channel) {
        case "EMAIL":
          if (user.email) recipients.push(user.email);
          break;
        case "SMS":
        case "WHATSAPP":
          if (user.phone) recipients.push(user.phone);
          break;
        case "PUSH": {
          const tokens = await this.deviceTokensService.listByUser(user.id);
          for (const deviceToken of tokens) recipients.push(deviceToken.token);
          break;
        }
        case "INAPP":
          recipients.push(user.id);
          break;
      }
    }

    return recipients;
  }

  private async resolveUsers(audienceDef: AudienceDef): ReturnType<UsersService["listByIds"]> {
    switch (audienceDef.kind) {
      case "STAFF_ROLE":
        return this.usersService.listActiveUsersByRoleId(audienceDef.roleId);
      case "EXPLICIT_USER_IDS":
        return this.usersService.listByIds(audienceDef.userIds);
      /* istanbul ignore next -- exhaustive over AudienceDef.kind, unreachable at the type level */
      default: {
        const exhaustive: never = audienceDef;
        throw new ValidationException(
          `Unsupported audience_def kind: ${String((exhaustive as { kind?: string })?.kind)} — ` +
            "guardian/parent audience kinds are deferred to Module 8 (Students), not yet built",
        );
      }
    }
  }

  private async transitionTo(
    id: string,
    target: CommBroadcastStatus,
    actorId: string | null,
  ): Promise<CommBroadcastEntity> {
    const broadcast = await this.broadcastRepository.findByIdOrFail(id);
    const allowed = ALLOWED_TRANSITIONS[broadcast.status];
    if (!allowed.includes(target)) {
      throw new ValidationException(`Illegal broadcast status transition: ${broadcast.status} -> ${target}`, {
        broadcastId: id,
        from: broadcast.status,
        to: target,
        allowed,
      });
    }
    broadcast.status = target;
    broadcast.updatedBy = actorId;
    return this.broadcastRepository.save(broadcast);
  }
}

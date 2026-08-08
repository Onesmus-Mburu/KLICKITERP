import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { AppConfigService } from "@klickit/server";
import type { Queue } from "bullmq";
import { OUTBOX_POLL_JOB_NAME, OUTBOX_POLL_QUEUE, OUTBOX_POLL_REPEAT_JOB_ID } from "./outbox-queue.constants";

/**
 * Registers the outbox dispatcher's repeatable poll trigger once, at worker
 * boot. `AppConfigService.outboxPollIntervalMs` (default 250ms, matching
 * docs/phase-3/02-communication-authentication.md §1.3's own documented
 * cadence) drives the `repeat.every` interval. Uses a fixed `jobId`
 * (`OUTBOX_POLL_REPEAT_JOB_ID`) so re-running this on every worker restart
 * does not accumulate duplicate repeatable schedules — BullMQ's repeatable
 * job registration is idempotent keyed on (name, repeat options, jobId).
 */
@Injectable()
export class OutboxPollScheduler implements OnModuleInit {
  private readonly logger = new Logger(OutboxPollScheduler.name);

  constructor(
    @InjectQueue(OUTBOX_POLL_QUEUE) private readonly queue: Queue,
    private readonly config: AppConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      OUTBOX_POLL_JOB_NAME,
      {},
      {
        jobId: OUTBOX_POLL_REPEAT_JOB_ID,
        repeat: { every: this.config.outboxPollIntervalMs },
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 20 },
      },
    );
    this.logger.log(`Outbox poll repeatable job scheduled — every ${this.config.outboxPollIntervalMs}ms`);
  }
}

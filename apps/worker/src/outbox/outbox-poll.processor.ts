import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { AppConfigService, OutboxDispatcherService } from "@klickit/server";
import type { Job } from "bullmq";
import { OUTBOX_POLL_QUEUE } from "./outbox-queue.constants";

/**
 * BullMQ worker consuming the `outbox-poll` queue's repeatable job
 * (`OutboxPollScheduler` schedules it; docs/phase-3/02-communication-authentication.md
 * §1.3: "outbox dispatcher (worker, 250ms poll / LISTEN-NOTIFY)" — this
 * implements the polling half; no LISTEN/NOTIFY). `concurrency: 1` is this
 * process's OWN overlap guard, ON TOP of `OutboxDispatcherService.pollOnce()`'s
 * in-instance `isPolling` flag: BullMQ never starts a second `process()`
 * call for this queue while the first is still running, so a poll tick that
 * takes longer than the repeat interval simply queues behind the one
 * already in flight instead of two polls ever racing each other.
 *
 * Every call simply delegates to `OutboxDispatcherService.pollOnce()` — see
 * that class's own doc comment for the full dispatch mechanics (idempotency
 * via `obx_consumer_mark`, per-row attempts/failure handling). This
 * processor owns no dispatch logic of its own; it is purely the BullMQ
 * trigger plumbing docs/phase-3/01-system-architecture.md ADR-003 names
 * ("main.worker.ts (BullMQ processors + cron)").
 */
@Processor(OUTBOX_POLL_QUEUE, { concurrency: 1 })
export class OutboxPollProcessor extends WorkerHost {
  private readonly logger = new Logger(OutboxPollProcessor.name);

  constructor(
    private readonly dispatcher: OutboxDispatcherService,
    private readonly config: AppConfigService,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const result = await this.dispatcher.pollOnce(this.config.outboxBatchSize);
    if (result.scanned > 0) {
      this.logger.log(
        `Outbox poll: scanned ${result.scanned}, published ${result.published}, failed ${result.failed}`,
      );
    }
  }
}

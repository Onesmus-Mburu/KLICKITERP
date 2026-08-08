import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AppConfigService, OutboxDispatcherModule } from "@klickit/server";
import Redis from "ioredis";
import { OutboxPollProcessor } from "./outbox-poll.processor";
import { OutboxPollScheduler } from "./outbox-poll.scheduler";
import { OUTBOX_POLL_QUEUE } from "./outbox-queue.constants";

/**
 * Wires real BullMQ into `apps/worker` — the architecturally-named
 * mechanism (docs/phase-3/01-system-architecture.md ADR-003:
 * "`main.worker.ts` (BullMQ processors + cron)") — even though the only job
 * registered today is this dispatcher's own poll trigger; there are no real
 * business queues yet (`comms.sms`/`comms.email`/`comms.push`/`billing`/etc.
 * from docs/phase-3/02-communication-authentication.md §1.2's queue
 * topology table remain unimplemented — see this app's own top-level doc
 * comment / `docs/phase-5/PROGRESS.md`'s honesty note for why that's
 * deliberately out of scope for this pass).
 *
 * `BullModule.forRootAsync()` opens ONE dedicated ioredis connection with
 * `maxRetriesPerRequest: null` — BullMQ's blocking commands (used by its
 * `Worker`/`QueueEvents` internals) are incompatible with a retry-limited
 * connection and BullMQ throws at startup if this isn't set. This is
 * deliberately a SEPARATE connection from `SharedInfraModule`'s
 * `REDIS_CLIENT` (`maxRetriesPerRequest: 3`, used for the app's own
 * lockout/session/permission-cache keys) rather than a reuse of it — the two
 * connections serve genuinely different retry semantics.
 *
 * `OutboxDispatcherModule` (from `@klickit/server`) provides
 * `OutboxDispatcherService`, injected by `OutboxPollProcessor`.
 */
@Module({
  imports: [
    OutboxDispatcherModule,
    BullModule.forRootAsync({
      useFactory: (config: AppConfigService) => ({
        connection: new Redis(config.redisUrl, { maxRetriesPerRequest: null }),
      }),
      inject: [AppConfigService],
    }),
    BullModule.registerQueue({ name: OUTBOX_POLL_QUEUE }),
  ],
  providers: [OutboxPollProcessor, OutboxPollScheduler],
})
export class OutboxQueueModule {}

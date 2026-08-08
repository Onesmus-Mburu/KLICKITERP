import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, IsNull } from "typeorm";
import { DomainEvent } from "./domain-event";
import { OutboxConsumerMarkEntity } from "./outbox-consumer-mark.entity";
import { OutboxEntity } from "./outbox.entity";
import { OUTBOX_HANDLERS, OutboxHandler } from "./outbox-handler.interface";

/** `obx_outbox.find({ take })` batch size when no explicit override is given — matches the task brief's own "LIMIT 100" figure. */
const DEFAULT_BATCH_SIZE = 100;

/**
 * Past this many failed dispatch attempts on one row, escalate the log
 * level from `warn` to `error` so a permanently-stuck row surfaces loudly
 * in ops monitoring — deliberately NOT a dead-letter table or an
 * infinite-retry safeguard beyond this (out of scope per this service's own
 * task brief: "logging loudly past some attempt count is fine; a whole new
 * DLQ subsystem is out of scope, not asked for").
 */
const LOUD_LOGGING_ATTEMPT_THRESHOLD = 5;

export interface OutboxPollResult {
  /** Unpublished rows read this poll (bounded by `batchSize`). */
  scanned: number;
  /** Rows stamped `published_at` this poll (includes rows with zero matching handlers). */
  published: number;
  /** Rows left unpublished because at least one matching handler threw. */
  failed: number;
}

/**
 * Polls `obx_outbox` for unpublished rows (`published_at IS NULL`, oldest
 * `seq` first — `seq` is a DB `GENERATED ALWAYS AS IDENTITY`, so ordering by
 * it is equivalent to commit order, which is also aggregate-order for any
 * single aggregate since all of one aggregate's writes come from the same
 * serialized business transactions) and, for each row, runs every
 * registered `OutboxHandler` whose `eventType` matches
 * (docs/phase-3/02-communication-authentication.md §1.3: "reads unpublished
 * rows in aggregate order ... marks published; handler failures retry
 * independently").
 *
 * This class was built to close the gap `OutboxWriterService`'s own doc
 * comment named ("Dispatching ... is a future worker concern, deliberately
 * not built here") — 44 call sites across every module already write real
 * rows to `obx_outbox` inside real business transactions; this is the first
 * code in this codebase that ever reads them back. It is intentionally
 * generic infrastructure: it does not know about, and never hardcodes, any
 * particular `eventType` — see `OUTBOX_HANDLERS`' own doc comment for how a
 * future module registers a real consumer. As of 2026-07-28 zero handlers
 * are registered anywhere (confirmed: no `@OnEvent`/handler classes exist
 * in this codebase), so every row this dispatcher currently sees has zero
 * matching handlers — a row with no registered consumers is still a valid
 * row to mark `published_at`, per this service's own task brief, so it does
 * so rather than leaving rows to accumulate unpublished forever waiting for
 * consumers that don't exist yet.
 *
 * **Per-row dispatch mechanics** (`processRow`):
 * 1. Find every registered handler whose `eventType` matches the row's.
 * 2. For each matching handler, check `obx_consumer_mark` for
 *    `(consumer=handler.consumerName, event_id=row.id)` FIRST — if present,
 *    skip re-invoking that handler (it already succeeded on a prior poll,
 *    this is the idempotency ledger `OutboxConsumerMarkEntity`'s own doc
 *    comment was written for).
 * 3. Otherwise run `handler.handle(payload, event)`, then insert the
 *    consumer-mark row. If this step throws (either the handler itself, or
 *    the mark insert — e.g. a rare concurrent-dispatcher unique-violation,
 *    treated the same as any other handler failure since the safe recovery
 *    is identical: retry next poll), the row is flagged failed and
 *    `attempts` is incremented; the row is NOT stamped published.
 * 4. Once every matching handler has EITHER succeeded (mark row exists,
 *    written this poll or a previous one) or the row has been flagged
 *    failed, the row's `published_at` is stamped iff no handler failed.
 *    A row that fails is retried on the NEXT poll: because step 2 checks
 *    marks first, handlers that already succeeded are NOT re-invoked — only
 *    the genuinely-failed handler(s) are retried
 *    ("handler failures retry independently", verbatim from
 *    docs/phase-3/02-communication-authentication.md §1.3). This also makes
 *    the mechanism self-healing across a worker crash mid-row: if the
 *    process dies after a handler's mark row committed but before
 *    `published_at` was stamped, the next poll sees the mark already
 *    present, skips re-running that handler, and (once every OTHER matching
 *    handler's mark is also present) stamps `published_at` — no handler
 *    is ever invoked twice for a row it already completed.
 *
 * **Overlap guard**: `pollOnce()` sets an in-instance `isPolling` flag for
 * the duration of a batch and no-ops (returns a zeroed result) if called
 * again while still running — defense in depth against whatever scheduling
 * mechanism drives it (`apps/worker`'s BullMQ repeatable job already runs
 * its consumer at `concurrency: 1`, which alone prevents two polls
 * overlapping within one process, but this flag keeps the guarantee true
 * even if that scheduling detail ever changes, and protects a
 * directly-called `pollOnce()` — e.g. from a test or an ops tool — from
 * overlapping a scheduler-driven one in the same process).
 */
@Injectable()
export class OutboxDispatcherService {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private isPolling = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() @Inject(OUTBOX_HANDLERS) private readonly handlers: OutboxHandler[] = [],
  ) {}

  async pollOnce(batchSize: number = DEFAULT_BATCH_SIZE): Promise<OutboxPollResult> {
    if (this.isPolling) {
      this.logger.debug("pollOnce: a previous poll is still running — skipping this tick to avoid double-processing.");
      return { scanned: 0, published: 0, failed: 0 };
    }
    this.isPolling = true;
    try {
      return await this.pollBatch(batchSize);
    } finally {
      this.isPolling = false;
    }
  }

  private async pollBatch(batchSize: number): Promise<OutboxPollResult> {
    const outboxRepo = this.dataSource.getRepository(OutboxEntity);
    const rows = await outboxRepo.find({
      where: { publishedAt: IsNull() },
      order: { seq: "ASC" },
      take: batchSize,
    });

    let published = 0;
    let failed = 0;
    for (const row of rows) {
      const ok = await this.processRow(row);
      if (ok) {
        published += 1;
      } else {
        failed += 1;
      }
    }
    return { scanned: rows.length, published, failed };
  }

  private async processRow(row: OutboxEntity): Promise<boolean> {
    const outboxRepo = this.dataSource.getRepository(OutboxEntity);
    const markRepo = this.dataSource.getRepository(OutboxConsumerMarkEntity);
    const matching = this.handlers.filter((handler) => handler.eventType === row.eventType);

    const event: DomainEvent = {
      eventType: row.eventType,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      payload: row.payload,
      occurredAt: row.occurredAt,
    };

    let anyFailed = false;
    for (const handler of matching) {
      const already = await markRepo.findOne({ where: { consumer: handler.consumerName, eventId: row.id } });
      if (already) {
        continue;
      }

      try {
        await handler.handle(row.payload, event);
        await markRepo.save(markRepo.create({ consumer: handler.consumerName, eventId: row.id }));
      } catch (error) {
        anyFailed = true;
        this.logger.warn(
          `Outbox handler "${handler.consumerName}" failed for event ${row.eventType} (row ${row.id}, aggregate ${row.aggregateType}/${row.aggregateId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (anyFailed) {
      const attempts = row.attempts + 1;
      await outboxRepo.update(row.id, { attempts });
      if (attempts >= LOUD_LOGGING_ATTEMPT_THRESHOLD) {
        this.logger.error(
          `obx_outbox row ${row.id} (${row.eventType}) has failed dispatch ${attempts} times and remains unpublished — investigate the failing handler(s); no dead-letter queue exists, this row will keep being retried every poll.`,
        );
      }
      return false;
    }

    await outboxRepo.update(row.id, { publishedAt: new Date() });
    return true;
  }
}

import { DataSource } from "typeorm";
import { OutboxConsumerMarkEntity } from "../outbox-consumer-mark.entity";
import { OutboxDispatcherService } from "../outbox-dispatcher.service";
import { OutboxHandler } from "../outbox-handler.interface";
import { OutboxEntity } from "../outbox.entity";

/**
 * Unit coverage for `OutboxDispatcherService`'s dispatch mechanics, mirroring
 * this codebase's existing pattern for mocking `DataSource`/repositories
 * (see `shared/database/__tests__/tx.spec.ts`'s own doc comment on the
 * house style: mock only what the class under test actually calls, cast
 * through `unknown` rather than reimplementing TypeORM). No live DB here —
 * this proves the SERVICE's own control flow (idempotency-mark check
 * ordering, attempts increment, zero-handler publish, overlap guard); the
 * end-to-end "does it really talk to Postgres" proof is the separate live
 * verification pass documented in docs/phase-5/PROGRESS.md.
 */
describe("OutboxDispatcherService", () => {
  function makeRow(overrides: Partial<OutboxEntity> = {}): OutboxEntity {
    return {
      id: "row-1",
      seq: "1",
      aggregateType: "test_aggregate",
      aggregateId: "agg-1",
      eventType: "test.event",
      payload: { hello: "world" },
      occurredAt: new Date("2026-07-28T00:00:00.000Z"),
      publishedAt: null,
      attempts: 0,
      ...overrides,
    } as OutboxEntity;
  }

  function makeHandler(overrides: Partial<OutboxHandler> = {}): OutboxHandler {
    return {
      eventType: "test.event",
      consumerName: "test.consumer",
      handle: jest.fn(async () => undefined),
      ...overrides,
    };
  }

  /** Builds a fake DataSource whose `getRepository()` returns distinct mock repos keyed by entity class, matching how the service actually calls it. */
  function makeDataSource(rows: OutboxEntity[], existingMarks: Array<{ consumer: string; eventId: string }> = []) {
    const outboxUpdate = jest.fn(async () => ({ affected: 1 }));
    const outboxFind = jest.fn(async () => rows);
    const marksSaved: Array<{ consumer: string; eventId: string }> = [];

    const markFindOne = jest.fn(async ({ where }: { where: { consumer: string; eventId: string } }) => {
      const hit = [...existingMarks, ...marksSaved].find(
        (m) => m.consumer === where.consumer && m.eventId === where.eventId,
      );
      return hit ?? null;
    });
    const markCreate = jest.fn((data: { consumer: string; eventId: string }) => data);
    const markSave = jest.fn(async (data: { consumer: string; eventId: string }) => {
      marksSaved.push(data);
      return data;
    });

    const outboxRepo = { find: outboxFind, update: outboxUpdate };
    const markRepo = { findOne: markFindOne, create: markCreate, save: markSave };

    const dataSource = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === OutboxEntity) return outboxRepo;
        if (entity === OutboxConsumerMarkEntity) return markRepo;
        throw new Error(`unexpected getRepository(${String(entity)}) call`);
      }),
    } as unknown as DataSource;

    return { dataSource, outboxRepo, markRepo, marksSaved };
  }

  it("marks a row published when it has zero registered handlers (the honest current state of this codebase)", async () => {
    const row = makeRow();
    const { dataSource, outboxRepo } = makeDataSource([row]);
    const service = new OutboxDispatcherService(dataSource, []);

    const result = await service.pollOnce();

    expect(result).toEqual({ scanned: 1, published: 1, failed: 0 });
    expect(outboxRepo.update).toHaveBeenCalledWith(row.id, { publishedAt: expect.any(Date) });
  });

  it("invokes a matching handler, records a consumer mark, and publishes the row", async () => {
    const row = makeRow();
    const handler = makeHandler();
    const { dataSource, outboxRepo, markRepo } = makeDataSource([row]);
    const service = new OutboxDispatcherService(dataSource, [handler]);

    const result = await service.pollOnce();

    expect(handler.handle).toHaveBeenCalledWith(row.payload, {
      eventType: row.eventType,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      payload: row.payload,
      occurredAt: row.occurredAt,
    });
    expect(markRepo.save).toHaveBeenCalledWith({ consumer: "test.consumer", eventId: row.id });
    expect(outboxRepo.update).toHaveBeenCalledWith(row.id, { publishedAt: expect.any(Date) });
    expect(result).toEqual({ scanned: 1, published: 1, failed: 0 });
  });

  it("never invokes a handler whose eventType does not match the row", async () => {
    const row = makeRow({ eventType: "billing.invoice-posted" });
    const handler = makeHandler({ eventType: "wallet.topped-up" });
    const { dataSource } = makeDataSource([row]);
    const service = new OutboxDispatcherService(dataSource, [handler]);

    await service.pollOnce();

    expect(handler.handle).not.toHaveBeenCalled();
  });

  it("skips re-invoking a handler whose consumer mark already exists (idempotency ledger check happens BEFORE calling handle())", async () => {
    const row = makeRow();
    const handler = makeHandler();
    const { dataSource, outboxRepo } = makeDataSource([row], [{ consumer: "test.consumer", eventId: row.id }]);
    const service = new OutboxDispatcherService(dataSource, [handler]);

    const result = await service.pollOnce();

    expect(handler.handle).not.toHaveBeenCalled();
    // Already-satisfied handler + no other matching handlers => still published.
    expect(outboxRepo.update).toHaveBeenCalledWith(row.id, { publishedAt: expect.any(Date) });
    expect(result.published).toBe(1);
  });

  it("on handler failure: increments attempts, leaves the row unpublished, and does NOT insert a consumer mark", async () => {
    const row = makeRow({ attempts: 2 });
    const handler = makeHandler({ handle: jest.fn(async () => { throw new Error("boom"); }) });
    const { dataSource, outboxRepo, markRepo } = makeDataSource([row]);
    const service = new OutboxDispatcherService(dataSource, [handler]);

    const result = await service.pollOnce();

    expect(markRepo.save).not.toHaveBeenCalled();
    expect(outboxRepo.update).toHaveBeenCalledWith(row.id, { attempts: 3 });
    expect(outboxRepo.update).not.toHaveBeenCalledWith(row.id, expect.objectContaining({ publishedAt: expect.anything() }));
    expect(result).toEqual({ scanned: 1, published: 0, failed: 1 });
  });

  it("runs every matching handler even after an earlier one fails, and still leaves the row unpublished if any failed", async () => {
    const row = makeRow();
    const failing = makeHandler({
      consumerName: "consumer.a",
      handle: jest.fn(async () => { throw new Error("boom"); }),
    });
    const succeeding = makeHandler({ consumerName: "consumer.b", handle: jest.fn(async () => undefined) });
    const { dataSource, outboxRepo, markRepo } = makeDataSource([row]);
    const service = new OutboxDispatcherService(dataSource, [failing, succeeding]);

    const result = await service.pollOnce();

    expect(failing.handle).toHaveBeenCalledTimes(1);
    expect(succeeding.handle).toHaveBeenCalledTimes(1);
    expect(markRepo.save).toHaveBeenCalledWith({ consumer: "consumer.b", eventId: row.id });
    expect(outboxRepo.update).toHaveBeenCalledWith(row.id, { attempts: 1 });
    expect(result.failed).toBe(1);
  });

  it("a retried poll after a failure does not re-invoke the handler that already succeeded (crash-recovery / self-healing behaviour)", async () => {
    const row = makeRow();
    const failing = makeHandler({
      consumerName: "consumer.a",
      handle: jest.fn(async () => { throw new Error("boom"); }),
    });
    const succeeded = makeHandler({ consumerName: "consumer.b", handle: jest.fn(async () => undefined) });
    const { dataSource, markRepo } = makeDataSource([row]);
    const service = new OutboxDispatcherService(dataSource, [failing, succeeded]);

    await service.pollOnce(); // first poll: consumer.b succeeds & marks, consumer.a fails
    expect(succeeded.handle).toHaveBeenCalledTimes(1);

    // Second poll: same row still unpublished (find() still returns it), consumer.b's mark now exists.
    await service.pollOnce();

    expect(succeeded.handle).toHaveBeenCalledTimes(1); // NOT called again
    expect(failing.handle).toHaveBeenCalledTimes(2); // retried, independently
    expect(markRepo.save).toHaveBeenCalledTimes(1); // only consumer.b's single successful mark
  });

  it("logs loudly (still just a log, no DLQ) once a row crosses the attempt threshold, but keeps retrying it", async () => {
    const row = makeRow({ attempts: 4 });
    const handler = makeHandler({ handle: jest.fn(async () => { throw new Error("still broken"); }) });
    const { dataSource, outboxRepo } = makeDataSource([row]);
    const service = new OutboxDispatcherService(dataSource, [handler]);

    const result = await service.pollOnce();

    expect(outboxRepo.update).toHaveBeenCalledWith(row.id, { attempts: 5 });
    expect(result.failed).toBe(1);
  });

  it("passes the requested batch size through to the underlying find() as `take`", async () => {
    const { dataSource, outboxRepo } = makeDataSource([]);
    const service = new OutboxDispatcherService(dataSource, []);

    await service.pollOnce(25);

    expect(outboxRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 25, order: { seq: "ASC" } }),
    );
  });

  it("does not double-process when pollOnce is called again while a previous call is still in flight", async () => {
    const row = makeRow();
    let releaseHandle!: () => void;
    let notifyInvoked!: () => void;
    const invoked = new Promise<void>((resolve) => {
      notifyInvoked = resolve;
    });
    const handler = makeHandler({
      handle: jest.fn(() => {
        notifyInvoked();
        return new Promise<void>((resolve) => {
          releaseHandle = resolve;
        });
      }),
    });
    const { dataSource } = makeDataSource([row]);
    const service = new OutboxDispatcherService(dataSource, [handler]);

    const firstPoll = service.pollOnce();
    // `isPolling` is set synchronously, before `pollOnce()`'s first
    // `await`, so a second call issued right away (no tick needed) already
    // observes it and short-circuits immediately — this assertion does NOT
    // depend on how far firstPoll's own async chain has progressed yet.
    const secondPoll = await service.pollOnce();
    expect(secondPoll).toEqual({ scanned: 0, published: 0, failed: 0 });

    // Deterministically wait until firstPoll's own chain has actually
    // reached (and called) handler.handle() — rather than an arbitrary
    // tick count — before releasing it and letting the batch finish.
    await invoked;
    releaseHandle();
    await firstPoll;

    // Proves secondPoll never invoked the handler: if it had, this would be 2.
    expect(handler.handle).toHaveBeenCalledTimes(1);
  });

  it("works correctly with an unbound OUTBOX_HANDLERS token (constructor default [])", async () => {
    const row = makeRow();
    const { dataSource, outboxRepo } = makeDataSource([row]);
    const service = new OutboxDispatcherService(dataSource, undefined as unknown as never);

    const result = await service.pollOnce();

    expect(result.published).toBe(1);
    expect(outboxRepo.update).toHaveBeenCalledWith(row.id, { publishedAt: expect.any(Date) });
  });
});

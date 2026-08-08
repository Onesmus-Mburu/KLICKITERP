import { DataSource } from "typeorm";
import { runInTransaction } from "../tx";

/**
 * Unit coverage for `runInTransaction()`'s retry-on-`40001` policy (see
 * tx.ts's doc comment for the full design rationale: a `40001` means
 * Postgres already aborted the transaction server-side, so the only valid
 * recovery is re-running the whole `work` callback in a brand new
 * transaction — this is the single choke point every real caller in this
 * codebase transacts through, so fixing it here covers
 * `NumberingService.allocate()`, `PostingService.post()`, and every other
 * caller uniformly). Mirrors this codebase's existing pattern for mocking
 * `DataSource.transaction()` (see `domains/students/__tests__/students.service.spec.ts`).
 */
describe("runInTransaction — retry-on-40001 (serialization_failure)", () => {
  function makeSerializationFailure(): Error {
    // Mirrors the exact shape TypeORM's Postgres driver surfaces a
    // QueryFailedError in — `error.driverError.code` — matching the same
    // `isUniqueViolation`-style extraction used across this codebase
    // (e.g. `NumberingService`'s own `isUniqueViolation()`).
    const error = new Error("could not serialize access due to concurrent update") as Error & {
      code?: string;
      driverError?: { code?: string };
    };
    error.driverError = { code: "40001" };
    return error;
  }

  it("returns work()'s result on the first attempt when nothing fails", async () => {
    const work = jest.fn(async (em: unknown) => "ok");
    const dataSource = {
      transaction: jest.fn(async (_isolation: string, fn: (m: unknown) => Promise<unknown>) => fn({})),
    } as unknown as DataSource;

    const result = await runInTransaction(dataSource, work);

    expect(result).toBe("ok");
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it("retries the ENTIRE work() callback in a fresh transaction after a 40001, and succeeds once the retry doesn't collide", async () => {
    let call = 0;
    const dataSource = {
      transaction: jest.fn(async (_isolation: string, fn: (m: unknown) => Promise<unknown>) => {
        call += 1;
        if (call === 1) {
          throw makeSerializationFailure();
        }
        return fn({ attempt: call });
      }),
    } as unknown as DataSource;

    const work = jest.fn(async (em: { attempt: number }) => `result-${em.attempt}`);

    const result = await runInTransaction(dataSource, work as never);

    expect(result).toBe("result-2");
    // work() is only invoked once — the FIRST transaction attempt failed
    // inside dataSource.transaction() itself (simulating the underlying
    // FOR UPDATE unblocking into a 40001) before ever calling back into
    // work(); the retry re-enters dataSource.transaction() fresh.
    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
  });

  it("gives up after the bounded attempt count and throws a clear, chained error", async () => {
    const dataSource = {
      transaction: jest.fn(async () => {
        throw makeSerializationFailure();
      }),
    } as unknown as DataSource;

    const work = jest.fn(async () => "never reached");

    await expect(runInTransaction(dataSource, work)).rejects.toThrow(/40001|serialization_failure/);
    // Bounded: exactly MAX_SERIALIZATION_ATTEMPTS (15) attempts, not unbounded retrying.
    expect(dataSource.transaction).toHaveBeenCalledTimes(15);
  });

  it("does NOT retry non-40001 errors — they propagate immediately on the first attempt", async () => {
    const notASerializationFailure = new Error("unique violation") as Error & { driverError?: { code?: string } };
    notASerializationFailure.driverError = { code: "23505" };

    const dataSource = {
      transaction: jest.fn(async () => {
        throw notASerializationFailure;
      }),
    } as unknown as DataSource;

    await expect(runInTransaction(dataSource, jest.fn())).rejects.toBe(notASerializationFailure);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it("chains the original 40001 error as .cause on the final thrown error", async () => {
    const original = makeSerializationFailure();
    const dataSource = {
      transaction: jest.fn(async () => {
        throw original;
      }),
    } as unknown as DataSource;

    try {
      await runInTransaction(dataSource, jest.fn());
      throw new Error("expected runInTransaction to throw");
    } catch (error) {
      expect((error as Error).cause).toBe(original);
    }
  });

  it("passes through the requested isolation level on every retry attempt", async () => {
    const isolationLevelsSeen: string[] = [];
    let call = 0;
    const dataSource = {
      transaction: jest.fn(async (isolation: string, fn: (m: unknown) => Promise<unknown>) => {
        isolationLevelsSeen.push(isolation);
        call += 1;
        if (call < 2) throw makeSerializationFailure();
        return fn({});
      }),
    } as unknown as DataSource;

    await runInTransaction(dataSource, async () => "ok", "SERIALIZABLE");

    expect(isolationLevelsSeen).toEqual(["SERIALIZABLE", "SERIALIZABLE"]);
  });
});

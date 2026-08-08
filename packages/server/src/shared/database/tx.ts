import { DataSource, EntityManager } from "typeorm";
import { IsolationLevel } from "typeorm/driver/types/IsolationLevel";

/**
 * Postgres serialization_failure SQLSTATE — see
 * https://www.postgresql.org/docs/current/errcodes-appendix.html and PG docs
 * §13.2.2. Under REPEATABLE READ (this helper's default isolation level), a
 * `SELECT ... FOR UPDATE` that blocks on a hot row and then unblocks onto a
 * version some OTHER transaction committed while it waited is required to
 * raise `40001` rather than silently proceed on stale-snapshot data — this is
 * documented, correct Postgres behaviour, not a bug. `NumberingService.allocate()`
 * (`platform/settings/application/numbering.service.ts`) is this codebase's
 * primary hot-row writer (every domain module allocates a document number
 * through it inside its own `runInTransaction()`/`tx()` call), so it is the
 * piece that first surfaced this under real concurrent load
 * (`docs/phase-5/PROGRESS.md`'s "Numbering allocator design note" flagged the
 * gap when Module 7 was built; the retry policy it called for was never
 * actually implemented until now).
 */
const PG_SERIALIZATION_FAILURE = "40001";

/**
 * Bounded retry count + short randomized backoff for `40001` — see
 * `runInTransaction`'s doc comment for why the retry lives here. Bumped from
 * an earlier 8 to 15 after live testing against a real Postgres instance:
 * `settings.integration.spec.ts`'s stress test fires 10 REPEATABLE READ
 * transactions at the exact same hot `set_numbering_series` row via a single
 * `Promise.all` tick (deliberately far more adversarial than any real caller
 * in this codebase produces — genuine traffic never fires that many
 * fully-simultaneous writers at one row in the same instant) and could,
 * through sheer thundering-herd bad luck (many losers re-colliding on their
 * retries together), occasionally exhaust a smaller bound even though the
 * retry mechanism itself is correct. 15 clears it reliably while staying
 * within a background operation's latency budget even in the worst case
 * (backoff tops out at ~15*20ms + jitter per wait, summed across a
 * fully-climbed retry ladder ≈ low seconds, not tens of seconds).
 */
const MAX_SERIALIZATION_ATTEMPTS = 15;
const RETRY_BACKOFF_BASE_MS = 20;

/**
 * Wraps `DataSource.transaction()` with the project default isolation level
 * (docs/phase-3/01-system-architecture.md §5 "Transactions": REPEATABLE READ
 * default, row locks on hot rows via `SELECT ... FOR UPDATE` inside `work`).
 * Every service that composes repositories + posting inside one ACID
 * transaction (D1) should go through this helper rather than calling
 * `dataSource.transaction()` directly, so isolation level stays consistent
 * and callers get a single, typed entry point.
 *
 * **Retry-on-`40001` (serialization failure)**: a `40001` means Postgres has
 * ALREADY aborted the transaction server-side by the time the error reaches
 * application code — no further statement can execute on that transaction
 * (any attempt raises `25P02 current transaction is aborted`), so the only
 * valid recovery is to re-run the ENTIRE `work` callback from scratch inside
 * a BRAND NEW transaction; retrying just the one statement that happened to
 * surface the error (e.g. re-issuing `NumberingService.allocate()`'s locked
 * `findOne()` alone) cannot work, because the transaction it would run
 * inside is already dead. That is exactly what this function is positioned
 * to do and `NumberingService.allocate()` itself is NOT: this is the sole
 * choke point in the codebase through which every real caller opens its
 * transaction (every `PostingService.post()`, `NumberingService.allocate()`,
 * etc. call happens inside a `work` callback passed here — see
 * `docs/phase-5/PROGRESS.md`'s Phase 5 Full Verification section for the
 * grep confirming no application code calls `dataSource.transaction()`
 * directly), so retrying here transparently covers every current and future
 * caller uniformly, with no per-service opt-in required. The tradeoff this
 * accepts: `work` MUST be safe to invoke more than once (idempotent as far
 * as anything it does OUTSIDE this transaction is concerned — e.g. no
 * fire-and-forget external HTTP calls before the transaction commits) since
 * a retried attempt re-runs it in full from the top with a fresh
 * `EntityManager`; every current caller in this codebase only performs
 * DB writes (rolled back automatically on the aborted attempt) plus pure
 * in-memory computation inside `work`, so this holds today.
 */
export async function runInTransaction<T>(
  dataSource: DataSource,
  work: (entityManager: EntityManager) => Promise<T>,
  isolationLevel: IsolationLevel = "REPEATABLE READ",
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_SERIALIZATION_ATTEMPTS; attempt++) {
    try {
      return await dataSource.transaction(isolationLevel, work);
    } catch (error) {
      const isLastAttempt = attempt === MAX_SERIALIZATION_ATTEMPTS;
      if (!isSerializationFailure(error) || isLastAttempt) {
        if (isSerializationFailure(error)) {
          throw new Error(
            `runInTransaction: gave up after ${MAX_SERIALIZATION_ATTEMPTS} attempts, ` +
              `still hitting Postgres 40001 (serialization_failure) — see tx.ts's doc comment`,
            { cause: error },
          );
        }
        throw error;
      }
      await sleep(RETRY_BACKOFF_BASE_MS * attempt + Math.floor(Math.random() * RETRY_BACKOFF_BASE_MS));
    }
  }
  /* istanbul ignore next -- unreachable: the loop above always either returns or throws */
  throw new Error("runInTransaction: unreachable");
}

function isSerializationFailure(error: unknown): boolean {
  const code =
    (error as { code?: string; driverError?: { code?: string } })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === PG_SERIALIZATION_FAILURE;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

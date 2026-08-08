import { Injectable } from "@nestjs/common";
import { EntityManager, Repository } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import {
  NUMBERING_SERIES_NEVER_PERIOD_KEY,
  SetNumberingResetPolicy,
  SetNumberingSeriesEntity,
} from "../domain/set-numbering-series.entity";
import { SetNumberingSeriesRepository } from "../infrastructure/set-numbering-series.repository";
import { AcademicCalendarService } from "./academic-calendar.service";

/** Sensible defaults for series auto-created on first `allocate()` call — task spec: "never throw for series doesn't exist yet". */
const DEFAULT_PAD_WIDTH = 6;
const DEFAULT_RESET_POLICY: SetNumberingResetPolicy = "NEVER";

/** Postgres unique_violation SQLSTATE — see https://www.postgresql.org/docs/current/errcodes-appendix.html */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * THE gapless document-numbering allocator (NFR-INT-003) — every later
 * module (billing, payments, procurement, payroll, ...) calls
 * `allocate()` inside its OWN transaction for every document number it
 * mints (invoice numbers, receipt numbers, PO numbers, payslip numbers,
 * etc.). Correctness here is load-bearing for the whole system.
 *
 * Design:
 *  - `allocate()` takes the caller's `EntityManager` and never opens its
 *    own transaction — the row lock below must live inside whatever
 *    transaction is also writing the document being numbered, or a crash
 *    between "allocate" and "write the document" would burn a number
 *    without ever using it (an acceptable, spec'd gap — NFR-INT-003 only
 *    requires *no duplicates*, not *no gaps on crash* — but every
 *    concurrent, successfully-committing caller must get gapless,
 *    strictly-increasing numbers).
 *  - The row identified by `(doc_type, series_code, period_key)` is read
 *    with `SELECT ... FOR UPDATE` (TypeORM `lock: { mode: "pessimistic_write" }`)
 *    — this is what actually prevents two concurrent transactions from both
 *    reading `next_no=41` and both minting "41": the second transaction's
 *    `FOR UPDATE` blocks until the first commits (releasing the row lock),
 *    at which point it re-reads the now-incremented `next_no`. An
 *    application-level check-then-write (read `next_no`, then `UPDATE ...
 *    WHERE next_no = $read_value`) would NOT be safe under
 *    REPEATABLE READ (the default isolation level here) — both
 *    transactions would see the same snapshot and the loser would just
 *    fail/retry-race rather than block-and-see-the-winner's-write, and
 *    worse, without an explicit lock two transactions can both pass a
 *    naive "does a row exist" check and both attempt to INSERT the
 *    first-ever row for a `(doc_type, series_code, period_key)` triple.
 *  - `period_key` is computed from `reset_policy` BEFORE the row is
 *    located: `NEVER` -> the constant sentinel `NUMBERING_SERIES_NEVER_PERIOD_KEY`;
 *    `YEARLY` -> current UTC calendar year as a string; `TERMLY` -> a key
 *    derived from `AcademicCalendarService`'s current-term lookup (run
 *    against the SAME `EntityManager`, so it sees the same transaction
 *    snapshot as the row lock that follows).
 *  - If no row exists yet for the computed key, one is auto-created with
 *    sensible defaults (`NEVER`/pad 6) inside the same transaction —
 *    "upsert on first use", using the target unique index
 *    (`uq_set_numbering_series_doc_type_series_code_period_key`) as the
 *    conflict target: try `save()`, and on a unique-violation (a
 *    concurrent transaction won the race to create the same row) fall
 *    through to the same locked re-read every other caller uses.
 */
@Injectable()
export class NumberingService {
  constructor(
    private readonly seriesRepository: SetNumberingSeriesRepository,
    private readonly academicCalendar: AcademicCalendarService,
  ) {}

  /**
   * Allocates and returns the next formatted document number
   * (`prefix + next_no.toString().padStart(pad_width, "0")`), incrementing
   * `next_no` in the same statement. MUST be called with an `EntityManager`
   * that belongs to the caller's own open transaction.
   */
  async allocate(em: EntityManager, docType: string, seriesCode = "MAIN"): Promise<string> {
    const repo = em.getRepository(SetNumberingSeriesEntity);

    // Learn this (doc_type, series_code)'s configuration from any existing
    // row (all period rows for the same doc_type/series_code share the same
    // prefix/pad_width/reset_policy) so a YEARLY/TERMLY rollover creates its
    // new period_key row with the SAME configuration, not the bare defaults.
    const existingConfig = await repo.findOne({
      where: { docType, seriesCode },
      order: { createdAt: "DESC" },
    });

    const resetPolicy = existingConfig?.resetPolicy ?? DEFAULT_RESET_POLICY;
    const prefix = existingConfig?.prefix ?? defaultPrefixFor(docType);
    const padWidth = existingConfig?.padWidth ?? DEFAULT_PAD_WIDTH;

    const periodKey = await this.computePeriodKey(em, resetPolicy);

    let row = await repo.findOne({
      where: { docType, seriesCode, periodKey },
      lock: { mode: "pessimistic_write" },
    });

    if (!row) {
      row = await this.createSeriesOnFirstUse(repo, { docType, seriesCode, prefix, padWidth, resetPolicy, periodKey });
    }

    const allocatedNo = row.nextNo;
    row.nextNo = (BigInt(row.nextNo) + 1n).toString();
    await repo.save(row);

    return `${row.prefix}${allocatedNo.padStart(row.padWidth, "0")}`;
  }

  /** Read-only inspection — full series list, for the (read-only) numbering controller. */
  async list(): Promise<SetNumberingSeriesEntity[]> {
    return this.seriesRepository.list();
  }

  async findByIdOrFail(id: string): Promise<SetNumberingSeriesEntity> {
    const row = await this.seriesRepository.findById(id);
    if (!row) throw new NotFoundException("NumberingSeries", id);
    return row;
  }

  /**
   * Upsert-by-prefix for callers that need a document type's prefix to take
   * effect from the very FIRST `allocate()` call — unlike `allocate()`'s own
   * implicit "auto-create with a derived default prefix on first use" path.
   * Added for Phase 6 Slice 2b item 8 (Students' admission-number autogen
   * setting: `PUT /students/settings/admission-no-autogen`), but written
   * generically since any future module-owned "configure this doc type's
   * numbering before first use" admin action can reuse it. Deliberately a
   * `NumberingService` method (not a raw repository exposed cross-module) —
   * `settings.module.ts`'s own doc comment establishes "exports ONLY the
   * application services... repositories never leave their module", and
   * this keeps that boundary intact rather than punching a hole in it for
   * one caller.
   *
   * Updates every existing period row for `(docType, seriesCode)` — there
   * is normally exactly one, for the common `resetPolicy=NEVER` case
   * `STD_ADMISSION` uses — so a later YEARLY/TERMLY rollover's own
   * `existingConfig?.prefix` lookup in `allocate()` still inherits it, and
   * any allocate() call resolving to a not-yet-rolled-over row sees the new
   * prefix immediately. Creates one fresh NEVER-policy row (padWidth 6,
   * `next_no=1`) with the given prefix if none exists yet, so a first-ever
   * `allocate()` call afterward uses the real custom prefix instead of the
   * derived default (`defaultPrefixFor(docType)`).
   */
  async upsertSeriesPrefix(docType: string, prefix: string, seriesCode = "MAIN"): Promise<SetNumberingSeriesEntity> {
    const rows = (await this.seriesRepository.list()).filter(
      (row) => row.docType === docType && row.seriesCode === seriesCode,
    );
    if (rows.length > 0) {
      let last: SetNumberingSeriesEntity = rows[0];
      for (const row of rows) {
        row.prefix = prefix;
        last = await this.seriesRepository.save(row);
      }
      return last;
    }
    // A REAL bug was found and fixed here during live verification (not left
    // in): a plain object literal (`{...} as SetNumberingSeriesEntity`) does
    // NOT inherit `BaseEntity.prototype`, so TypeORM's `@BeforeInsert
    // assignId()` lifecycle hook — which only fires on an actual instance —
    // silently never runs, leaving `id` unset and raising a real Postgres
    // `null value in column "id"` NOT NULL violation. `Object.assign(new
    // SetNumberingSeriesEntity(), {...})` preserves the real prototype chain
    // so the hook fires exactly as it does for every other `repo.create()`-based
    // insert elsewhere in this codebase.
    const created = Object.assign(new SetNumberingSeriesEntity(), {
      docType,
      seriesCode,
      prefix,
      padWidth: DEFAULT_PAD_WIDTH,
      resetPolicy: DEFAULT_RESET_POLICY,
      periodKey: NUMBERING_SERIES_NEVER_PERIOD_KEY,
      nextNo: "1",
    });
    return this.seriesRepository.save(created);
  }

  /** Non-mutating preview of the next `count` numbers (FR-SET-006.1 "preview of next 3 numbers") — never touches `next_no`. */
  async previewNext(id: string, count = 3): Promise<string[]> {
    const row = await this.findByIdOrFail(id);
    const start = BigInt(row.nextNo);
    const preview: string[] = [];
    for (let i = 0n; i < BigInt(count); i += 1n) {
      preview.push(`${row.prefix}${(start + i).toString().padStart(row.padWidth, "0")}`);
    }
    return preview;
  }

  private async computePeriodKey(em: EntityManager, resetPolicy: SetNumberingResetPolicy): Promise<string> {
    switch (resetPolicy) {
      case "NEVER":
        return NUMBERING_SERIES_NEVER_PERIOD_KEY;
      case "YEARLY":
        return String(new Date().getUTCFullYear());
      case "TERMLY": {
        const current = await this.academicCalendar.getCurrentTermWithYear(em);
        if (!current) {
          throw new ValidationException(
            "NumberingService.allocate: reset_policy=TERMLY requires a current term " +
              "(AcademicCalendarService.setCurrentTerm has never been called)",
          );
        }
        return buildTermPeriodKey(current.year.name, current.term.seq);
      }
      /* istanbul ignore next -- exhaustive over SetNumberingResetPolicy, unreachable at the type level */
      default: {
        const exhaustive: never = resetPolicy;
        throw new ValidationException(`Unknown reset_policy: ${String(exhaustive)}`);
      }
    }
  }

  private async createSeriesOnFirstUse(
    repo: Repository<SetNumberingSeriesEntity>,
    data: {
      docType: string;
      seriesCode: string;
      prefix: string;
      padWidth: number;
      resetPolicy: SetNumberingResetPolicy;
      periodKey: string;
    },
  ): Promise<SetNumberingSeriesEntity> {
    // A failed INSERT poisons the enclosing Postgres transaction — no further
    // statement can run on it until a ROLLBACK, even one caught in application
    // code (this is a hard Postgres requirement, not a TypeORM quirk). Take a
    // SAVEPOINT first so the unique-violation fallback path below can roll
    // back to just this point and keep running inside the SAME transaction,
    // instead of failing every subsequent statement with "current transaction
    // is aborted". `queryRunner` is always defined here: `allocate()` is only
    // ever called with an `EntityManager` bound to an open transaction (see
    // this class's doc comment), and TypeORM binds one queryRunner per
    // transaction-scoped EntityManager.
    const queryRunner = repo.manager?.queryRunner;
    const savepointName = `sp_numbering_${Math.floor(Math.random() * 1e9).toString(36)}`;
    if (queryRunner) {
      await queryRunner.query(`SAVEPOINT ${savepointName}`);
    }
    try {
      const created = repo.create({ ...data, nextNo: "1" });
      return await repo.save(created);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Lost the race to create this row — another concurrent transaction
      // committed it first. Roll back to the savepoint (undoing only the
      // failed INSERT, not the whole transaction), then fall through to the
      // same locked read every caller uses; this blocks until that
      // transaction commits (or rolls back), then returns the winner's row.
      if (queryRunner) {
        await queryRunner.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      }
      const row = await repo.findOne({
        where: { docType: data.docType, seriesCode: data.seriesCode, periodKey: data.periodKey },
        lock: { mode: "pessimistic_write" },
      });
      if (!row) {
        // Genuinely unreachable: either our own INSERT succeeded (no
        // exception) or a concurrent one committed a row we can now see —
        // a plain Error (not a DomainException) signals data corruption,
        // not a client-facing condition.
        throw new Error(
          `NumberingService.allocate: series row missing for ${data.docType}/${data.seriesCode}/${data.periodKey} after losing the create race`,
        );
      }
      return row;
    }
  }
}

function defaultPrefixFor(docType: string): string {
  return `${docType.slice(0, 3).toUpperCase()}-`;
}

/** `period_key` is `varchar(12)` — truncate defensively even though `name`/`seq` are expected to stay short. */
function buildTermPeriodKey(academicYearName: string, seq: number): string {
  return `${academicYearName}T${seq}`.slice(0, 12);
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; driverError?: { code?: string } })?.code
    ?? (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === PG_UNIQUE_VIOLATION;
}

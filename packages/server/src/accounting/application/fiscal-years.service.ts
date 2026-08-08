import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { runInTransaction } from "../../shared/database/tx";
import { OutboxWriterService } from "../../shared/events/outbox-writer.service";
import { ConflictException } from "../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../shared/exceptions/validation.exception";
import { PeriodClosedEvent } from "../events/period-closed.event";
import { GlFiscalYearEntity, GlFiscalYearStatus } from "../domain/gl-fiscal-year.entity";
import { GlPeriodEntity } from "../domain/gl-period.entity";
import { GlFiscalYearRepository } from "../infrastructure/gl-fiscal-year.repository";
import { GlPeriodRepository } from "../infrastructure/gl-period.repository";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_PERIOD_COUNT = 12;

export interface CreateFiscalYearInput {
  name: string;
  startsOn: string;
  endsOn: string;
  periodCount?: number;
}

/**
 * `gl_fiscal_year` + `gl_period` lifecycle.
 *
 * **Period auto-generation** (`create()`): splits `[startsOn, endsOn]`
 * (inclusive) into `periodCount` (default 12) contiguous, equal-length-as-
 * possible day ranges — the leftover days (`totalDays % periodCount`) go to
 * the earliest periods one day each, so every period differs by at most one
 * day and the periods' union is exactly the fiscal year's range with no
 * gaps or overlaps. This is a deliberate simplification (equal calendar-day
 * slices, not calendar-month boundaries) — the DDL/task brief don't mandate
 * real calendar months, and day-slicing is correct for any `periodCount`/
 * range combination a caller supplies, not just "12 periods over exactly a
 * 365-day year".
 *
 * **Sequential period-close enforcement** (a documented judgement call —
 * the DDL only encodes `gl_period.status`'s three-value CHECK, not the
 * transition order): `hardClosePeriod()` requires the period to already be
 * `SOFT_CLOSED`; a period cannot jump straight from `OPEN` to `HARD_CLOSED`.
 * `openPeriod()` can reopen an `OPEN` or `SOFT_CLOSED` period but never a
 * `HARD_CLOSED` one — hard close is treated as final.
 *
 * **Fiscal year status derivation**: recomputed after every period
 * transition — `LOCKED` when every period is `HARD_CLOSED`, `CLOSING` when
 * at least one (but not all) periods are `HARD_CLOSED`, `OPEN` otherwise.
 */
@Injectable()
export class FiscalYearsService {
  constructor(
    private readonly fiscalYearRepository: GlFiscalYearRepository,
    private readonly periodRepository: GlPeriodRepository,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly outboxWriter: OutboxWriterService,
  ) {}

  async create(input: CreateFiscalYearInput, actorId: string | null): Promise<GlFiscalYearEntity> {
    if (await this.fiscalYearRepository.findByName(input.name)) {
      throw new ConflictException(`gl_fiscal_year name already in use: ${input.name}`);
    }
    const periodCount = input.periodCount ?? DEFAULT_PERIOD_COUNT;
    if (!Number.isInteger(periodCount) || periodCount < 1) {
      throw new ValidationException("periodCount must be a positive integer");
    }
    const boundaries = splitDateRange(input.startsOn, input.endsOn, periodCount);

    return runInTransaction(this.dataSource, async (manager) => {
      const fiscalYear = await this.fiscalYearRepository.create(
        {
          name: input.name,
          startsOn: input.startsOn,
          endsOn: input.endsOn,
          status: "OPEN",
          createdBy: actorId,
          updatedBy: actorId,
        },
        manager,
      );

      for (let seq = 1; seq <= periodCount; seq++) {
        const boundary = boundaries[seq - 1];
        await this.periodRepository.create(
          {
            fiscalYearId: fiscalYear.id,
            seq,
            startsOn: boundary.startsOn,
            endsOn: boundary.endsOn,
            status: "OPEN",
            createdBy: actorId,
            updatedBy: actorId,
          },
          manager,
        );
      }

      return fiscalYear;
    });
  }

  async findByIdOrFail(id: string): Promise<GlFiscalYearEntity> {
    return this.fiscalYearRepository.findByIdOrFail(id);
  }

  async list(): Promise<GlFiscalYearEntity[]> {
    return this.fiscalYearRepository.list();
  }

  async listPeriods(fiscalYearId: string): Promise<GlPeriodEntity[]> {
    return this.periodRepository.listByFiscalYear(fiscalYearId);
  }

  async findPeriodByIdOrFail(id: string): Promise<GlPeriodEntity> {
    return this.periodRepository.findByIdOrFail(id);
  }

  async openPeriod(periodId: string, actorId: string | null): Promise<GlPeriodEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const period = await this.periodRepository.findByIdOrFail(periodId, manager);
      if (period.status === "HARD_CLOSED") {
        throw new ValidationException(
          `Cannot reopen period ${periodId} — HARD_CLOSED is final (sequential close enforcement)`,
        );
      }
      period.status = "OPEN";
      period.updatedBy = actorId;
      const saved = await this.periodRepository.save(period, manager);
      await this.recomputeFiscalYearStatus(saved.fiscalYearId, actorId, manager);
      return saved;
    });
  }

  async softClosePeriod(periodId: string, actorId: string | null): Promise<GlPeriodEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const period = await this.periodRepository.findByIdOrFail(periodId, manager);
      if (period.status === "HARD_CLOSED") {
        throw new ValidationException(
          `Cannot soft-close period ${periodId} — it is already HARD_CLOSED (sequential close enforcement)`,
        );
      }
      period.status = "SOFT_CLOSED";
      period.updatedBy = actorId;
      const saved = await this.periodRepository.save(period, manager);
      await this.recomputeFiscalYearStatus(saved.fiscalYearId, actorId, manager);
      return saved;
    });
  }

  /** Requires the period to already be SOFT_CLOSED — see class doc comment "Sequential period-close enforcement". */
  async hardClosePeriod(periodId: string, actorId: string | null): Promise<GlPeriodEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const period = await this.periodRepository.findByIdOrFail(periodId, manager);
      if (period.status !== "SOFT_CLOSED") {
        throw new ValidationException(
          `Period ${periodId} must be SOFT_CLOSED before it can be HARD_CLOSED (status=${period.status}) — ` +
            "sequential close enforcement, cannot skip straight from OPEN",
        );
      }
      period.status = "HARD_CLOSED";
      period.updatedBy = actorId;
      const saved = await this.periodRepository.save(period, manager);
      await this.recomputeFiscalYearStatus(saved.fiscalYearId, actorId, manager);

      await this.outboxWriter.write(
        manager,
        new PeriodClosedEvent(saved.id, { periodId: saved.id, fiscalYearId: saved.fiscalYearId, actorId }),
      );

      return saved;
    });
  }

  private async recomputeFiscalYearStatus(
    fiscalYearId: string,
    actorId: string | null,
    manager: EntityManager,
  ): Promise<void> {
    const periods = await this.periodRepository.listByFiscalYear(fiscalYearId, manager);
    const allHardClosed = periods.length > 0 && periods.every((period) => period.status === "HARD_CLOSED");
    const anyHardClosed = periods.some((period) => period.status === "HARD_CLOSED");
    const nextStatus: GlFiscalYearStatus = allHardClosed ? "LOCKED" : anyHardClosed ? "CLOSING" : "OPEN";

    const fiscalYear = await this.fiscalYearRepository.findByIdOrFail(fiscalYearId, manager);
    if (fiscalYear.status !== nextStatus) {
      fiscalYear.status = nextStatus;
      fiscalYear.updatedBy = actorId;
      await this.fiscalYearRepository.save(fiscalYear, manager);
    }
  }
}

function splitDateRange(
  startsOn: string,
  endsOn: string,
  count: number,
): Array<{ startsOn: string; endsOn: string }> {
  const start = new Date(`${startsOn}T00:00:00Z`);
  const end = new Date(`${endsOn}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new ValidationException("startsOn/endsOn must be valid ISO date strings (YYYY-MM-DD)");
  }
  const totalDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
  if (totalDays < count) {
    throw new ValidationException(
      `Fiscal year range (${totalDays} day(s)) is too short to split into ${count} periods`,
    );
  }

  const baseDaysPerPeriod = Math.floor(totalDays / count);
  const remainderDays = totalDays % count;

  const boundaries: Array<{ startsOn: string; endsOn: string }> = [];
  let cursor = new Date(start);
  for (let i = 0; i < count; i++) {
    const daysInThisPeriod = baseDaysPerPeriod + (i < remainderDays ? 1 : 0);
    const periodStart = new Date(cursor);
    const periodEnd = new Date(cursor);
    periodEnd.setUTCDate(periodEnd.getUTCDate() + daysInThisPeriod - 1);
    boundaries.push({ startsOn: toDateString(periodStart), endsOn: toDateString(periodEnd) });
    cursor = new Date(periodEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return boundaries;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

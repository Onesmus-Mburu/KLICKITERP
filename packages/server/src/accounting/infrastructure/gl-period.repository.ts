import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, LessThanOrEqual, MoreThanOrEqual, Repository } from "typeorm";
import { NotFoundException } from "../../shared/exceptions/not-found.exception";
import { GlPeriodEntity } from "../domain/gl-period.entity";

@Injectable()
export class GlPeriodRepository {
  constructor(
    @InjectRepository(GlPeriodEntity)
    private readonly repo: Repository<GlPeriodEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<GlPeriodEntity | null> {
    return (manager?.getRepository(GlPeriodEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<GlPeriodEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("GlPeriod", id);
    return row;
  }

  async findByFiscalYearAndSeq(
    fiscalYearId: string,
    seq: number,
    manager?: EntityManager,
  ): Promise<GlPeriodEntity | null> {
    return (manager?.getRepository(GlPeriodEntity) ?? this.repo).findOne({ where: { fiscalYearId, seq } });
  }

  async listByFiscalYear(fiscalYearId: string, manager?: EntityManager): Promise<GlPeriodEntity[]> {
    return (manager?.getRepository(GlPeriodEntity) ?? this.repo).find({
      where: { fiscalYearId },
      order: { seq: "ASC" },
    });
  }

  /**
   * The period whose [starts_on, ends_on] range contains `date` — the
   * finder `PostingService.resolvePeriod()` uses to stamp a journal's
   * `period_id` from its `journal_date` (also `trg_gl_period_open`'s job at
   * the DB layer to reject postings into a period that's `HARD_CLOSED`).
   *
   * Nothing in the DDL prevents two DIFFERENT `gl_fiscal_year`s from having
   * overlapping `[starts_on, ends_on]` periods (real single-tenant usage
   * never actually creates that — a school configures one linear sequence
   * of fiscal years — but nothing stops a bug, a bad import, or, in this
   * repo's own long-running integration-test database, dozens of disposable
   * per-test fiscal years all sharing the same generously-wide throwaway
   * date range from accumulating over many verification runs). Without an
   * explicit `ORDER BY`, `findOne()` on more than one match returns
   * whichever row Postgres's planner happens to return first — undefined
   * from the application's point of view, and it previously surfaced as a
   * real bug: `banking-e2e.integration.spec.ts`'s reconciliation `lock()`
   * assertion failed because a transfer/adjustment pair posted "today" each
   * independently landed in an ARBITRARY stale period from an unrelated
   * prior test run, not the period the test had just created and expected.
   * Ordering by `created_at DESC` (most recently created period wins ties)
   * makes the result deterministic and, in the common case, correct: the
   * most recently configured fiscal year for a given date should be
   * authoritative over any older, presumably-superseded one.
   */
  async findCurrentForDate(date: string, manager?: EntityManager): Promise<GlPeriodEntity | null> {
    return (manager?.getRepository(GlPeriodEntity) ?? this.repo).findOne({
      where: { startsOn: LessThanOrEqual(date), endsOn: MoreThanOrEqual(date) },
      order: { createdAt: "DESC" },
    });
  }

  async create(data: Partial<GlPeriodEntity>, manager: EntityManager): Promise<GlPeriodEntity> {
    const repo = manager.getRepository(GlPeriodEntity);
    return repo.save(repo.create(data));
  }

  async save(entity: GlPeriodEntity, manager?: EntityManager): Promise<GlPeriodEntity> {
    return (manager?.getRepository(GlPeriodEntity) ?? this.repo).save(entity);
  }
}

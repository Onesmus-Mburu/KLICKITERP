import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, In, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PYRL_RUN_COMMITTED_STATUSES, PyrlRunEntity, PyrlRunStatus } from "../domain/pyrl-run.entity";

export interface ListPyrlRunsFilter {
  periodKey?: string;
  status?: PyrlRunStatus;
}

/**
 * Plain repository wrapper for `pyrl_run`, plus
 * `findFinalizedMainForPeriod()` — BR-PYRL-02's exact lookup (mirrors
 * `uq_pyrl_main_run_p`'s partial-unique invariant: at most one row can ever
 * match).
 */
@Injectable()
export class PyrlRunRepository {
  constructor(
    @InjectRepository(PyrlRunEntity)
    private readonly repo: Repository<PyrlRunEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<PyrlRunEntity | null> {
    return (manager?.getRepository(PyrlRunEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PyrlRunEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("PyrlRun", id);
    return row;
  }

  async list(filter: ListPyrlRunsFilter = {}, manager?: EntityManager): Promise<PyrlRunEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.periodKey !== undefined) where.periodKey = filter.periodKey;
    if (filter.status !== undefined) where.status = filter.status;
    return (manager?.getRepository(PyrlRunEntity) ?? this.repo).find({ where, order: { periodKey: "DESC" } });
  }

  /**
   * BR-PYRL-02: the finalized (COMMITTED/PAID/FILED) MAIN run for a period,
   * if any — at most one, by `uq_pyrl_main_run_p` (migration `0241` widened
   * both this query and that index from a `status='COMMITTED'`-only match,
   * a real bug: a run stays "the finalized one" for a period for its whole
   * remaining lifetime, not just the single instant its status literally
   * equals `COMMITTED` — the old narrow match silently stopped finding a
   * period's own run the moment it normally progressed to `PAID`/`FILED`,
   * which broke 3 real call sites: `createRun()`'s own duplicate-MAIN-run
   * guard, BR-PYRL-03's prior-period deferred-loan-recovery carryover
   * lookup, and `review()`'s prior-period variance-report comparison —
   * every one of them was silently finding "no prior run" for any REAL
   * historical period, which by the time you're computing the NEXT period
   * has almost always already moved past `COMMITTED`).
   */
  async findFinalizedMainForPeriod(
    periodKey: string,
    manager?: EntityManager,
  ): Promise<PyrlRunEntity | null> {
    return (manager?.getRepository(PyrlRunEntity) ?? this.repo).findOne({
      where: { periodKey, runKind: "MAIN", status: In(PYRL_RUN_COMMITTED_STATUSES) },
    });
  }

  async create(data: Partial<PyrlRunEntity>, manager?: EntityManager): Promise<PyrlRunEntity> {
    const repo = manager?.getRepository(PyrlRunEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: PyrlRunEntity, manager?: EntityManager): Promise<PyrlRunEntity> {
    return (manager?.getRepository(PyrlRunEntity) ?? this.repo).save(entity);
  }
}

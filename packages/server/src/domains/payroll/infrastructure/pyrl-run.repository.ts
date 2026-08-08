import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PyrlRunEntity, PyrlRunStatus } from "../domain/pyrl-run.entity";

export interface ListPyrlRunsFilter {
  periodKey?: string;
  status?: PyrlRunStatus;
}

/**
 * Plain repository wrapper for `pyrl_run`, plus
 * `findCommittedMainForPeriod()` — BR-PYRL-02's exact lookup (mirrors
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

  /** BR-PYRL-02: the COMMITTED MAIN run for a period, if any (at most one, by `uq_pyrl_main_run_p`). */
  async findCommittedMainForPeriod(
    periodKey: string,
    manager?: EntityManager,
  ): Promise<PyrlRunEntity | null> {
    return (manager?.getRepository(PyrlRunEntity) ?? this.repo).findOne({
      where: { periodKey, runKind: "MAIN", status: "COMMITTED" },
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

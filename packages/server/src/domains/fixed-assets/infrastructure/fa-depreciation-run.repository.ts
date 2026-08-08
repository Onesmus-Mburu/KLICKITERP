import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { FaDepreciationRunEntity, FaDepreciationRunStatus } from "../domain/fa-depreciation-run.entity";

export interface ListFaDepreciationRunsFilter {
  status?: FaDepreciationRunStatus;
}

/**
 * Plain repository wrapper for `fa_depreciation_run`, plus
 * `findByPeriodId()` — the UQ's own lookup (`uq_fa_depreciation_run_period_id`),
 * the next pass's "at most one run per period" pre-check.
 */
@Injectable()
export class FaDepreciationRunRepository {
  constructor(
    @InjectRepository(FaDepreciationRunEntity)
    private readonly repo: Repository<FaDepreciationRunEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<FaDepreciationRunEntity | null> {
    return (manager?.getRepository(FaDepreciationRunEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<FaDepreciationRunEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("FaDepreciationRun", id);
    return row;
  }

  /** `period_id` is UNIQUE — at most one depreciation run per fiscal period. */
  async findByPeriodId(periodId: string, manager?: EntityManager): Promise<FaDepreciationRunEntity | null> {
    return (manager?.getRepository(FaDepreciationRunEntity) ?? this.repo).findOne({ where: { periodId } });
  }

  async list(filter: ListFaDepreciationRunsFilter = {}, manager?: EntityManager): Promise<FaDepreciationRunEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.status !== undefined) where.status = filter.status;
    return (manager?.getRepository(FaDepreciationRunEntity) ?? this.repo).find({
      where,
      order: { createdAt: "DESC" },
    });
  }

  async create(data: Partial<FaDepreciationRunEntity>, manager?: EntityManager): Promise<FaDepreciationRunEntity> {
    const repo = manager?.getRepository(FaDepreciationRunEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: FaDepreciationRunEntity, manager?: EntityManager): Promise<FaDepreciationRunEntity> {
    return (manager?.getRepository(FaDepreciationRunEntity) ?? this.repo).save(entity);
  }
}

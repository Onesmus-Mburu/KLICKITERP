import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { FaDepreciationLineEntity } from "../domain/fa-depreciation-line.entity";

/** Plain repository wrapper for `fa_depreciation_line`, plus `findByRunId()`. */
@Injectable()
export class FaDepreciationLineRepository {
  constructor(
    @InjectRepository(FaDepreciationLineEntity)
    private readonly repo: Repository<FaDepreciationLineEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<FaDepreciationLineEntity | null> {
    return (manager?.getRepository(FaDepreciationLineEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<FaDepreciationLineEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("FaDepreciationLine", id);
    return row;
  }

  /** All lines of a run — the next pass's variance-review/GL-posting entry point. */
  async findByRunId(runId: string, manager?: EntityManager): Promise<FaDepreciationLineEntity[]> {
    return (manager?.getRepository(FaDepreciationLineEntity) ?? this.repo).find({ where: { runId } });
  }

  async create(data: Partial<FaDepreciationLineEntity>, manager?: EntityManager): Promise<FaDepreciationLineEntity> {
    const repo = manager?.getRepository(FaDepreciationLineEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: FaDepreciationLineEntity, manager?: EntityManager): Promise<FaDepreciationLineEntity> {
    return (manager?.getRepository(FaDepreciationLineEntity) ?? this.repo).save(entity);
  }
}

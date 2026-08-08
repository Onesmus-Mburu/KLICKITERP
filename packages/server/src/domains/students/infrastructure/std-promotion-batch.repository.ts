import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { StdPromotionBatchEntity } from "../domain/std-promotion-batch.entity";

@Injectable()
export class StdPromotionBatchRepository {
  constructor(
    @InjectRepository(StdPromotionBatchEntity)
    private readonly repo: Repository<StdPromotionBatchEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<StdPromotionBatchEntity | null> {
    return (manager?.getRepository(StdPromotionBatchEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<StdPromotionBatchEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("StdPromotionBatch", id);
    return row;
  }

  async list(manager?: EntityManager): Promise<StdPromotionBatchEntity[]> {
    return (manager?.getRepository(StdPromotionBatchEntity) ?? this.repo).find({ order: { executedAt: "DESC" } });
  }

  async create(data: Partial<StdPromotionBatchEntity>, manager: EntityManager): Promise<StdPromotionBatchEntity> {
    const repo = manager.getRepository(StdPromotionBatchEntity);
    return repo.save(repo.create(data));
  }
}

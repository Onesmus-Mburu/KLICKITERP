import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ExpReplenishmentEntity, ExpReplenishmentStatus } from "../domain/exp-replenishment.entity";

/** Plain repository wrapper for `exp_replenishment`. */
@Injectable()
export class ExpReplenishmentRepository {
  constructor(
    @InjectRepository(ExpReplenishmentEntity)
    private readonly repo: Repository<ExpReplenishmentEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ExpReplenishmentEntity | null> {
    return (manager?.getRepository(ExpReplenishmentEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ExpReplenishmentEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ExpReplenishment", id);
    return row;
  }

  async listByFloatId(
    floatId: string,
    status?: ExpReplenishmentStatus,
    manager?: EntityManager,
  ): Promise<ExpReplenishmentEntity[]> {
    const where: Record<string, unknown> = { floatId };
    if (status !== undefined) where.status = status;
    return (manager?.getRepository(ExpReplenishmentEntity) ?? this.repo).find({
      where,
      order: { createdAt: "DESC" },
    });
  }

  async create(data: Partial<ExpReplenishmentEntity>, manager?: EntityManager): Promise<ExpReplenishmentEntity> {
    const repo = manager?.getRepository(ExpReplenishmentEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ExpReplenishmentEntity, manager?: EntityManager): Promise<ExpReplenishmentEntity> {
    return (manager?.getRepository(ExpReplenishmentEntity) ?? this.repo).save(entity);
  }

  /** `PettyCashService.onApprovalDecided()`'s rejection path — see that method's doc comment for why a rejected replenishment is deleted rather than transitioned (the 3-value DDL enum has no REJECTED/CANCELLED state). */
  async delete(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(ExpReplenishmentEntity) ?? this.repo).delete(id);
  }
}

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ApprLevelEntity } from "../domain/appr-level.entity";

@Injectable()
export class ApprLevelRepository {
  constructor(
    @InjectRepository(ApprLevelEntity)
    private readonly repo: Repository<ApprLevelEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ApprLevelEntity | null> {
    return (manager?.getRepository(ApprLevelEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ApprLevelEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ApprLevel", id);
    return row;
  }

  async listByVersion(workflowVersionId: string, manager?: EntityManager): Promise<ApprLevelEntity[]> {
    return (manager?.getRepository(ApprLevelEntity) ?? this.repo).find({
      where: { workflowVersionId },
      order: { seq: "ASC" },
    });
  }

  async create(data: Partial<ApprLevelEntity>, manager?: EntityManager): Promise<ApprLevelEntity> {
    const repo = manager?.getRepository(ApprLevelEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ApprLevelEntity, manager?: EntityManager): Promise<ApprLevelEntity> {
    return (manager?.getRepository(ApprLevelEntity) ?? this.repo).save(entity);
  }

  async deleteByVersion(workflowVersionId: string, manager: EntityManager): Promise<void> {
    await manager.getRepository(ApprLevelEntity).delete({ workflowVersionId });
  }
}

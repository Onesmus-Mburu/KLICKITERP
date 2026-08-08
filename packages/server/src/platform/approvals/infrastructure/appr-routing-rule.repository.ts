import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ApprRoutingRuleEntity } from "../domain/appr-routing-rule.entity";

@Injectable()
export class ApprRoutingRuleRepository {
  constructor(
    @InjectRepository(ApprRoutingRuleEntity)
    private readonly repo: Repository<ApprRoutingRuleEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ApprRoutingRuleEntity | null> {
    return (manager?.getRepository(ApprRoutingRuleEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ApprRoutingRuleEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ApprRoutingRule", id);
    return row;
  }

  async listByVersion(workflowVersionId: string, manager?: EntityManager): Promise<ApprRoutingRuleEntity[]> {
    return (manager?.getRepository(ApprRoutingRuleEntity) ?? this.repo).find({
      where: { workflowVersionId },
      order: { minAmount: "ASC" },
    });
  }

  async create(data: Partial<ApprRoutingRuleEntity>, manager?: EntityManager): Promise<ApprRoutingRuleEntity> {
    const repo = manager?.getRepository(ApprRoutingRuleEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ApprRoutingRuleEntity, manager?: EntityManager): Promise<ApprRoutingRuleEntity> {
    return (manager?.getRepository(ApprRoutingRuleEntity) ?? this.repo).save(entity);
  }

  async deleteByVersion(workflowVersionId: string, manager: EntityManager): Promise<void> {
    await manager.getRepository(ApprRoutingRuleEntity).delete({ workflowVersionId });
  }
}

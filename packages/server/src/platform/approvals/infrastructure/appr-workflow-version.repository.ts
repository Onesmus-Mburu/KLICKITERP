import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ApprWorkflowVersionEntity } from "../domain/appr-workflow-version.entity";

@Injectable()
export class ApprWorkflowVersionRepository {
  constructor(
    @InjectRepository(ApprWorkflowVersionEntity)
    private readonly repo: Repository<ApprWorkflowVersionEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ApprWorkflowVersionEntity | null> {
    return (manager?.getRepository(ApprWorkflowVersionEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ApprWorkflowVersionEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ApprWorkflowVersion", id);
    return row;
  }

  async findCurrent(workflowDefId: string, manager?: EntityManager): Promise<ApprWorkflowVersionEntity | null> {
    return (manager?.getRepository(ApprWorkflowVersionEntity) ?? this.repo).findOne({
      where: { workflowDefId, isCurrent: true },
    });
  }

  async listByDef(workflowDefId: string, manager?: EntityManager): Promise<ApprWorkflowVersionEntity[]> {
    return (manager?.getRepository(ApprWorkflowVersionEntity) ?? this.repo).find({
      where: { workflowDefId },
      order: { version: "DESC" },
    });
  }

  async create(data: Partial<ApprWorkflowVersionEntity>, manager?: EntityManager): Promise<ApprWorkflowVersionEntity> {
    const repo = manager?.getRepository(ApprWorkflowVersionEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ApprWorkflowVersionEntity, manager?: EntityManager): Promise<ApprWorkflowVersionEntity> {
    return (manager?.getRepository(ApprWorkflowVersionEntity) ?? this.repo).save(entity);
  }
}

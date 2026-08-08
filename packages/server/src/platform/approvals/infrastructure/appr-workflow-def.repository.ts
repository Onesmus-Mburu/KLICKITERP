import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ApprWorkflowDefEntity } from "../domain/appr-workflow-def.entity";

@Injectable()
export class ApprWorkflowDefRepository {
  constructor(
    @InjectRepository(ApprWorkflowDefEntity)
    private readonly repo: Repository<ApprWorkflowDefEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ApprWorkflowDefEntity | null> {
    return (manager?.getRepository(ApprWorkflowDefEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ApprWorkflowDefEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ApprWorkflowDef", id);
    return row;
  }

  async findByDomainCode(domainCode: string, manager?: EntityManager): Promise<ApprWorkflowDefEntity | null> {
    return (manager?.getRepository(ApprWorkflowDefEntity) ?? this.repo).findOne({ where: { domainCode } });
  }

  async list(manager?: EntityManager): Promise<ApprWorkflowDefEntity[]> {
    return (manager?.getRepository(ApprWorkflowDefEntity) ?? this.repo).find({ order: { createdAt: "ASC" } });
  }

  async create(data: Partial<ApprWorkflowDefEntity>, manager?: EntityManager): Promise<ApprWorkflowDefEntity> {
    const repo = manager?.getRepository(ApprWorkflowDefEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ApprWorkflowDefEntity, manager?: EntityManager): Promise<ApprWorkflowDefEntity> {
    return (manager?.getRepository(ApprWorkflowDefEntity) ?? this.repo).save(entity);
  }
}

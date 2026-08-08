import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ApprInstanceEntity, ApprInstanceStatus } from "../domain/appr-instance.entity";

export interface ListInstancesFilter {
  status?: ApprInstanceStatus;
  domainCode?: string;
}

@Injectable()
export class ApprInstanceRepository {
  constructor(
    @InjectRepository(ApprInstanceEntity)
    private readonly repo: Repository<ApprInstanceEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ApprInstanceEntity | null> {
    return (manager?.getRepository(ApprInstanceEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ApprInstanceEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ApprInstance", id);
    return row;
  }

  /** The "verify approval_ref before posting" lookup — at most one row can exist per entity while PENDING. */
  async findOpenByEntity(
    entityType: string,
    entityId: string,
    manager?: EntityManager,
  ): Promise<ApprInstanceEntity | null> {
    return (manager?.getRepository(ApprInstanceEntity) ?? this.repo).findOne({
      where: { entityType, entityId, status: "PENDING" },
    });
  }

  /** Latest instance for an entity regardless of status — `getStatus()` returns the most recent one. */
  async findLatestByEntity(
    entityType: string,
    entityId: string,
    manager?: EntityManager,
  ): Promise<ApprInstanceEntity | null> {
    return (manager?.getRepository(ApprInstanceEntity) ?? this.repo).findOne({
      where: { entityType, entityId },
      order: { submittedAt: "DESC" },
    });
  }

  async list(filter: ListInstancesFilter, manager?: EntityManager): Promise<ApprInstanceEntity[]> {
    return (manager?.getRepository(ApprInstanceEntity) ?? this.repo).find({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.domainCode ? { domainCode: filter.domainCode } : {}),
      },
      order: { submittedAt: "DESC" },
    });
  }

  /** All open (PENDING) instances — `ApprovalEngineService.listPendingForApprover()` filters this set by approver eligibility. */
  async listPending(manager?: EntityManager): Promise<ApprInstanceEntity[]> {
    return (manager?.getRepository(ApprInstanceEntity) ?? this.repo).find({
      where: { status: "PENDING" },
      order: { submittedAt: "ASC" },
    });
  }

  async create(data: Partial<ApprInstanceEntity>, manager: EntityManager): Promise<ApprInstanceEntity> {
    const repo = manager.getRepository(ApprInstanceEntity);
    return repo.save(repo.create(data));
  }

  async save(entity: ApprInstanceEntity, manager?: EntityManager): Promise<ApprInstanceEntity> {
    return (manager?.getRepository(ApprInstanceEntity) ?? this.repo).save(entity);
  }
}

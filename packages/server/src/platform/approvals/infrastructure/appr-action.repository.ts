import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { ApprActionEntity } from "../domain/appr-action.entity";

@Injectable()
export class ApprActionRepository {
  constructor(
    @InjectRepository(ApprActionEntity)
    private readonly repo: Repository<ApprActionEntity>,
  ) {}

  async listByInstance(instanceId: string, manager?: EntityManager): Promise<ApprActionEntity[]> {
    return (manager?.getRepository(ApprActionEntity) ?? this.repo).find({
      where: { instanceId },
      order: { actedAt: "ASC" },
    });
  }

  /** APPROVE actions recorded at a given level — the PARALLEL-mode quorum count. */
  async countApprovalsAtLevel(instanceId: string, levelSeq: number, manager: EntityManager): Promise<number> {
    return manager.getRepository(ApprActionEntity).count({
      where: { instanceId, levelSeq, decision: "APPROVE" },
    });
  }

  async create(data: Partial<ApprActionEntity>, manager: EntityManager): Promise<ApprActionEntity> {
    const repo = manager.getRepository(ApprActionEntity);
    return repo.save(repo.create(data));
  }
}

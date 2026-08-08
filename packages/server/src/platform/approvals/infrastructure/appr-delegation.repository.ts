import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ApprDelegationEntity } from "../domain/appr-delegation.entity";

@Injectable()
export class ApprDelegationRepository {
  constructor(
    @InjectRepository(ApprDelegationEntity)
    private readonly repo: Repository<ApprDelegationEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ApprDelegationEntity | null> {
    return (manager?.getRepository(ApprDelegationEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ApprDelegationEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ApprDelegation", id);
    return row;
  }

  async list(manager?: EntityManager): Promise<ApprDelegationEntity[]> {
    return (manager?.getRepository(ApprDelegationEntity) ?? this.repo).find({ order: { startsOn: "DESC" } });
  }

  /** All delegation rows with `fromUserId` in scope — `resolveEffectiveApprover` filters these by date in memory. */
  async listByFromUser(fromUserId: string, manager?: EntityManager): Promise<ApprDelegationEntity[]> {
    return (manager?.getRepository(ApprDelegationEntity) ?? this.repo).find({ where: { fromUserId } });
  }

  async create(data: Partial<ApprDelegationEntity>, manager?: EntityManager): Promise<ApprDelegationEntity> {
    const repo = manager?.getRepository(ApprDelegationEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ApprDelegationEntity, manager?: EntityManager): Promise<ApprDelegationEntity> {
    return (manager?.getRepository(ApprDelegationEntity) ?? this.repo).save(entity);
  }

  async delete(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(ApprDelegationEntity) ?? this.repo).delete({ id });
  }
}

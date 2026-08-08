import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ExpClaimLineEntity } from "../domain/exp-claim-line.entity";

/** Plain repository wrapper for `exp_claim_line`. */
@Injectable()
export class ExpClaimLineRepository {
  constructor(
    @InjectRepository(ExpClaimLineEntity)
    private readonly repo: Repository<ExpClaimLineEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ExpClaimLineEntity | null> {
    return (manager?.getRepository(ExpClaimLineEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ExpClaimLineEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ExpClaimLine", id);
    return row;
  }

  async listByClaimId(claimId: string, manager?: EntityManager): Promise<ExpClaimLineEntity[]> {
    return (manager?.getRepository(ExpClaimLineEntity) ?? this.repo).find({
      where: { claimId },
      order: { lineNo: "ASC" },
    });
  }

  async create(data: Partial<ExpClaimLineEntity>, manager?: EntityManager): Promise<ExpClaimLineEntity> {
    const repo = manager?.getRepository(ExpClaimLineEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ExpClaimLineEntity, manager?: EntityManager): Promise<ExpClaimLineEntity> {
    return (manager?.getRepository(ExpClaimLineEntity) ?? this.repo).save(entity);
  }

  async delete(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(ExpClaimLineEntity) ?? this.repo).delete(id);
  }
}

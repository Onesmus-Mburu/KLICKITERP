import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BillLateFeeBatchEntity } from "../domain/bill-late-fee-batch.entity";

@Injectable()
export class BillLateFeeBatchRepository {
  constructor(
    @InjectRepository(BillLateFeeBatchEntity)
    private readonly repo: Repository<BillLateFeeBatchEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BillLateFeeBatchEntity | null> {
    return (manager?.getRepository(BillLateFeeBatchEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BillLateFeeBatchEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BillLateFeeBatch", id);
    return row;
  }

  async listByPolicy(policyId: string, manager?: EntityManager): Promise<BillLateFeeBatchEntity[]> {
    return (manager?.getRepository(BillLateFeeBatchEntity) ?? this.repo).find({
      where: { policyId },
      order: { runDate: "DESC" },
    });
  }

  async create(data: Partial<BillLateFeeBatchEntity>, manager?: EntityManager): Promise<BillLateFeeBatchEntity> {
    const repo = manager?.getRepository(BillLateFeeBatchEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BillLateFeeBatchEntity, manager?: EntityManager): Promise<BillLateFeeBatchEntity> {
    return (manager?.getRepository(BillLateFeeBatchEntity) ?? this.repo).save(entity);
  }
}

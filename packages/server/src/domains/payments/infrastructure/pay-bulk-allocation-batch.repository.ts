import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PayBulkAllocationBatchEntity } from "../domain/pay-bulk-allocation-batch.entity";

@Injectable()
export class PayBulkAllocationBatchRepository {
  constructor(
    @InjectRepository(PayBulkAllocationBatchEntity)
    private readonly repo: Repository<PayBulkAllocationBatchEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<PayBulkAllocationBatchEntity | null> {
    return (manager?.getRepository(PayBulkAllocationBatchEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PayBulkAllocationBatchEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("PayBulkAllocationBatch", id);
    return row;
  }

  async create(
    data: Partial<PayBulkAllocationBatchEntity>,
    manager?: EntityManager,
  ): Promise<PayBulkAllocationBatchEntity> {
    const repo = manager?.getRepository(PayBulkAllocationBatchEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: PayBulkAllocationBatchEntity, manager?: EntityManager): Promise<PayBulkAllocationBatchEntity> {
    return (manager?.getRepository(PayBulkAllocationBatchEntity) ?? this.repo).save(entity);
  }
}

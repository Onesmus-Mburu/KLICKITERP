import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PayBulkAllocationBatchLineEntity } from "../domain/pay-bulk-allocation-batch-line.entity";

@Injectable()
export class PayBulkAllocationBatchLineRepository {
  constructor(
    @InjectRepository(PayBulkAllocationBatchLineEntity)
    private readonly repo: Repository<PayBulkAllocationBatchLineEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<PayBulkAllocationBatchLineEntity | null> {
    return (manager?.getRepository(PayBulkAllocationBatchLineEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PayBulkAllocationBatchLineEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("PayBulkAllocationBatchLine", id);
    return row;
  }

  async listByBatch(batchId: string, manager?: EntityManager): Promise<PayBulkAllocationBatchLineEntity[]> {
    return (manager?.getRepository(PayBulkAllocationBatchLineEntity) ?? this.repo).find({ where: { batchId } });
  }

  async create(
    data: Partial<PayBulkAllocationBatchLineEntity>,
    manager?: EntityManager,
  ): Promise<PayBulkAllocationBatchLineEntity> {
    const repo = manager?.getRepository(PayBulkAllocationBatchLineEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(
    entity: PayBulkAllocationBatchLineEntity,
    manager?: EntityManager,
  ): Promise<PayBulkAllocationBatchLineEntity> {
    return (manager?.getRepository(PayBulkAllocationBatchLineEntity) ?? this.repo).save(entity);
  }
}

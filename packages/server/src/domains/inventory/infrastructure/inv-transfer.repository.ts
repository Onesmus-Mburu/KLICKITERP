import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { InvTransferEntity, InvTransferStatus } from "../domain/inv-transfer.entity";

export interface ListInvTransfersFilter {
  status?: InvTransferStatus;
  fromStoreId?: string;
  toStoreId?: string;
}

/** Plain repository wrapper for `inv_transfer`. */
@Injectable()
export class InvTransferRepository {
  constructor(
    @InjectRepository(InvTransferEntity)
    private readonly repo: Repository<InvTransferEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<InvTransferEntity | null> {
    return (manager?.getRepository(InvTransferEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<InvTransferEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("InvTransfer", id);
    return row;
  }

  async findByNumber(number: string, manager?: EntityManager): Promise<InvTransferEntity | null> {
    return (manager?.getRepository(InvTransferEntity) ?? this.repo).findOne({ where: { number } });
  }

  async list(filter: ListInvTransfersFilter = {}, manager?: EntityManager): Promise<InvTransferEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.status !== undefined) where.status = filter.status;
    if (filter.fromStoreId !== undefined) where.fromStoreId = filter.fromStoreId;
    if (filter.toStoreId !== undefined) where.toStoreId = filter.toStoreId;
    return (manager?.getRepository(InvTransferEntity) ?? this.repo).find({ where, order: { createdAt: "DESC" } });
  }

  async create(data: Partial<InvTransferEntity>, manager?: EntityManager): Promise<InvTransferEntity> {
    const repo = manager?.getRepository(InvTransferEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: InvTransferEntity, manager?: EntityManager): Promise<InvTransferEntity> {
    return (manager?.getRepository(InvTransferEntity) ?? this.repo).save(entity);
  }
}

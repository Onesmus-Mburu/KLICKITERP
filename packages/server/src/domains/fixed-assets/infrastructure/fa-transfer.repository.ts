import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { FaTransferEntity } from "../domain/fa-transfer.entity";

/** Plain repository wrapper for `fa_transfer`, plus `findByAssetId()`. */
@Injectable()
export class FaTransferRepository {
  constructor(
    @InjectRepository(FaTransferEntity)
    private readonly repo: Repository<FaTransferEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<FaTransferEntity | null> {
    return (manager?.getRepository(FaTransferEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<FaTransferEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("FaTransfer", id);
    return row;
  }

  /** An asset's full transfer history, newest first. */
  async findByAssetId(assetId: string, manager?: EntityManager): Promise<FaTransferEntity[]> {
    return (manager?.getRepository(FaTransferEntity) ?? this.repo).find({
      where: { assetId },
      order: { createdAt: "DESC" },
    });
  }

  async create(data: Partial<FaTransferEntity>, manager?: EntityManager): Promise<FaTransferEntity> {
    const repo = manager?.getRepository(FaTransferEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: FaTransferEntity, manager?: EntityManager): Promise<FaTransferEntity> {
    return (manager?.getRepository(FaTransferEntity) ?? this.repo).save(entity);
  }
}

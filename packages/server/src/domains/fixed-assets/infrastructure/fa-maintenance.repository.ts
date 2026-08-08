import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { FaMaintenanceEntity } from "../domain/fa-maintenance.entity";

/** Plain repository wrapper for `fa_maintenance`, plus `findByAssetId()`. */
@Injectable()
export class FaMaintenanceRepository {
  constructor(
    @InjectRepository(FaMaintenanceEntity)
    private readonly repo: Repository<FaMaintenanceEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<FaMaintenanceEntity | null> {
    return (manager?.getRepository(FaMaintenanceEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<FaMaintenanceEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("FaMaintenance", id);
    return row;
  }

  /** An asset's full maintenance history, newest first. */
  async findByAssetId(assetId: string, manager?: EntityManager): Promise<FaMaintenanceEntity[]> {
    return (manager?.getRepository(FaMaintenanceEntity) ?? this.repo).find({
      where: { assetId },
      order: { createdAt: "DESC" },
    });
  }

  async create(data: Partial<FaMaintenanceEntity>, manager?: EntityManager): Promise<FaMaintenanceEntity> {
    const repo = manager?.getRepository(FaMaintenanceEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: FaMaintenanceEntity, manager?: EntityManager): Promise<FaMaintenanceEntity> {
    return (manager?.getRepository(FaMaintenanceEntity) ?? this.repo).save(entity);
  }
}

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../shared/exceptions/not-found.exception";
import { GlCostCenterEntity } from "../domain/gl-cost-center.entity";

@Injectable()
export class GlCostCenterRepository {
  constructor(
    @InjectRepository(GlCostCenterEntity)
    private readonly repo: Repository<GlCostCenterEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<GlCostCenterEntity | null> {
    return (manager?.getRepository(GlCostCenterEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<GlCostCenterEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("GlCostCenter", id);
    return row;
  }

  async findByCode(code: string, manager?: EntityManager): Promise<GlCostCenterEntity | null> {
    return (manager?.getRepository(GlCostCenterEntity) ?? this.repo).findOne({ where: { code } });
  }

  async list(activeOnly = false, manager?: EntityManager): Promise<GlCostCenterEntity[]> {
    return (manager?.getRepository(GlCostCenterEntity) ?? this.repo).find({
      where: activeOnly ? { isActive: true } : {},
      order: { code: "ASC" },
    });
  }

  async create(data: Partial<GlCostCenterEntity>, manager: EntityManager): Promise<GlCostCenterEntity> {
    const repo = manager.getRepository(GlCostCenterEntity);
    return repo.save(repo.create(data));
  }

  async save(entity: GlCostCenterEntity, manager?: EntityManager): Promise<GlCostCenterEntity> {
    return (manager?.getRepository(GlCostCenterEntity) ?? this.repo).save(entity);
  }
}

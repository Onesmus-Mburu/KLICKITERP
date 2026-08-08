import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { WallServicePointEntity } from "../domain/wall-service-point.entity";

@Injectable()
export class WallServicePointRepository {
  constructor(
    @InjectRepository(WallServicePointEntity)
    private readonly repo: Repository<WallServicePointEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<WallServicePointEntity | null> {
    return (manager?.getRepository(WallServicePointEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<WallServicePointEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("WallServicePoint", id);
    return row;
  }

  async findByName(name: string, manager?: EntityManager): Promise<WallServicePointEntity | null> {
    return (manager?.getRepository(WallServicePointEntity) ?? this.repo).findOne({ where: { name } });
  }

  async list(manager?: EntityManager): Promise<WallServicePointEntity[]> {
    return (manager?.getRepository(WallServicePointEntity) ?? this.repo).find({ order: { name: "ASC" } });
  }

  async create(data: Partial<WallServicePointEntity>, manager?: EntityManager): Promise<WallServicePointEntity> {
    const repo = manager?.getRepository(WallServicePointEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: WallServicePointEntity, manager?: EntityManager): Promise<WallServicePointEntity> {
    return (manager?.getRepository(WallServicePointEntity) ?? this.repo).save(entity);
  }
}

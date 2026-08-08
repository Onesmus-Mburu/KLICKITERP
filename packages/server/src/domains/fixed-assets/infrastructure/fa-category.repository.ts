import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { FaCategoryEntity } from "../domain/fa-category.entity";

/** Plain repository wrapper for `fa_category`. */
@Injectable()
export class FaCategoryRepository {
  constructor(
    @InjectRepository(FaCategoryEntity)
    private readonly repo: Repository<FaCategoryEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<FaCategoryEntity | null> {
    return (manager?.getRepository(FaCategoryEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<FaCategoryEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("FaCategory", id);
    return row;
  }

  async findByName(name: string, manager?: EntityManager): Promise<FaCategoryEntity | null> {
    return (manager?.getRepository(FaCategoryEntity) ?? this.repo).findOne({ where: { name } });
  }

  async list(manager?: EntityManager): Promise<FaCategoryEntity[]> {
    return (manager?.getRepository(FaCategoryEntity) ?? this.repo).find({ order: { name: "ASC" } });
  }

  async create(data: Partial<FaCategoryEntity>, manager?: EntityManager): Promise<FaCategoryEntity> {
    const repo = manager?.getRepository(FaCategoryEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: FaCategoryEntity, manager?: EntityManager): Promise<FaCategoryEntity> {
    return (manager?.getRepository(FaCategoryEntity) ?? this.repo).save(entity);
  }
}

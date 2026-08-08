import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, IsNull, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ExpCategoryEntity } from "../domain/exp-category.entity";

/** Plain repository wrapper for `exp_category`. */
@Injectable()
export class ExpCategoryRepository {
  constructor(
    @InjectRepository(ExpCategoryEntity)
    private readonly repo: Repository<ExpCategoryEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ExpCategoryEntity | null> {
    return (manager?.getRepository(ExpCategoryEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ExpCategoryEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ExpCategory", id);
    return row;
  }

  async findByName(name: string, manager?: EntityManager): Promise<ExpCategoryEntity | null> {
    return (manager?.getRepository(ExpCategoryEntity) ?? this.repo).findOne({ where: { name } });
  }

  async listByParent(parentId: string | null, manager?: EntityManager): Promise<ExpCategoryEntity[]> {
    return (manager?.getRepository(ExpCategoryEntity) ?? this.repo).find({
      where: { parentId: parentId === null ? IsNull() : parentId },
      order: { name: "ASC" },
    });
  }

  async listAll(manager?: EntityManager): Promise<ExpCategoryEntity[]> {
    return (manager?.getRepository(ExpCategoryEntity) ?? this.repo).find({ order: { name: "ASC" } });
  }

  async create(data: Partial<ExpCategoryEntity>, manager?: EntityManager): Promise<ExpCategoryEntity> {
    const repo = manager?.getRepository(ExpCategoryEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ExpCategoryEntity, manager?: EntityManager): Promise<ExpCategoryEntity> {
    return (manager?.getRepository(ExpCategoryEntity) ?? this.repo).save(entity);
  }
}

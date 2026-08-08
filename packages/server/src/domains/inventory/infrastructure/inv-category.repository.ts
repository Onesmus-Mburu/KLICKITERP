import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, IsNull, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { InvCategoryEntity } from "../domain/inv-category.entity";

/** Plain repository wrapper for `inv_category`. */
@Injectable()
export class InvCategoryRepository {
  constructor(
    @InjectRepository(InvCategoryEntity)
    private readonly repo: Repository<InvCategoryEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<InvCategoryEntity | null> {
    return (manager?.getRepository(InvCategoryEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<InvCategoryEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("InvCategory", id);
    return row;
  }

  async findByName(name: string, manager?: EntityManager): Promise<InvCategoryEntity | null> {
    return (manager?.getRepository(InvCategoryEntity) ?? this.repo).findOne({ where: { name } });
  }

  async listByParent(parentId: string | null, manager?: EntityManager): Promise<InvCategoryEntity[]> {
    return (manager?.getRepository(InvCategoryEntity) ?? this.repo).find({
      where: { parentId: parentId === null ? IsNull() : parentId },
      order: { name: "ASC" },
    });
  }

  async listAll(manager?: EntityManager): Promise<InvCategoryEntity[]> {
    return (manager?.getRepository(InvCategoryEntity) ?? this.repo).find({ order: { name: "ASC" } });
  }

  async create(data: Partial<InvCategoryEntity>, manager?: EntityManager): Promise<InvCategoryEntity> {
    const repo = manager?.getRepository(InvCategoryEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: InvCategoryEntity, manager?: EntityManager): Promise<InvCategoryEntity> {
    return (manager?.getRepository(InvCategoryEntity) ?? this.repo).save(entity);
  }
}

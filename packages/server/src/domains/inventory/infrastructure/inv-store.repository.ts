import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { InvStoreEntity } from "../domain/inv-store.entity";

export interface ListInvStoresFilter {
  isActive?: boolean;
}

/** Plain repository wrapper for `inv_store`. */
@Injectable()
export class InvStoreRepository {
  constructor(
    @InjectRepository(InvStoreEntity)
    private readonly repo: Repository<InvStoreEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<InvStoreEntity | null> {
    return (manager?.getRepository(InvStoreEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<InvStoreEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("InvStore", id);
    return row;
  }

  async findByName(name: string, manager?: EntityManager): Promise<InvStoreEntity | null> {
    return (manager?.getRepository(InvStoreEntity) ?? this.repo).findOne({ where: { name } });
  }

  async list(filter: ListInvStoresFilter = {}, manager?: EntityManager): Promise<InvStoreEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.isActive !== undefined) where.isActive = filter.isActive;
    return (manager?.getRepository(InvStoreEntity) ?? this.repo).find({ where, order: { name: "ASC" } });
  }

  async create(data: Partial<InvStoreEntity>, manager?: EntityManager): Promise<InvStoreEntity> {
    const repo = manager?.getRepository(InvStoreEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: InvStoreEntity, manager?: EntityManager): Promise<InvStoreEntity> {
    return (manager?.getRepository(InvStoreEntity) ?? this.repo).save(entity);
  }
}

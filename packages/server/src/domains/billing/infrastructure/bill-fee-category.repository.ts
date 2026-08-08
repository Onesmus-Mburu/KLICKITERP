import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BillFeeCategoryEntity } from "../domain/bill-fee-category.entity";

@Injectable()
export class BillFeeCategoryRepository {
  constructor(
    @InjectRepository(BillFeeCategoryEntity)
    private readonly repo: Repository<BillFeeCategoryEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BillFeeCategoryEntity | null> {
    return (manager?.getRepository(BillFeeCategoryEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BillFeeCategoryEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BillFeeCategory", id);
    return row;
  }

  async findByName(name: string, manager?: EntityManager): Promise<BillFeeCategoryEntity | null> {
    return (manager?.getRepository(BillFeeCategoryEntity) ?? this.repo).findOne({ where: { name } });
  }

  async list(manager?: EntityManager): Promise<BillFeeCategoryEntity[]> {
    return (manager?.getRepository(BillFeeCategoryEntity) ?? this.repo).find({ order: { priority: "ASC" } });
  }

  async create(data: Partial<BillFeeCategoryEntity>, manager?: EntityManager): Promise<BillFeeCategoryEntity> {
    const repo = manager?.getRepository(BillFeeCategoryEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BillFeeCategoryEntity, manager?: EntityManager): Promise<BillFeeCategoryEntity> {
    return (manager?.getRepository(BillFeeCategoryEntity) ?? this.repo).save(entity);
  }
}

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BillConcessionSchemeEntity } from "../domain/bill-concession-scheme.entity";

@Injectable()
export class BillConcessionSchemeRepository {
  constructor(
    @InjectRepository(BillConcessionSchemeEntity)
    private readonly repo: Repository<BillConcessionSchemeEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BillConcessionSchemeEntity | null> {
    return (manager?.getRepository(BillConcessionSchemeEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BillConcessionSchemeEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BillConcessionScheme", id);
    return row;
  }

  async findByName(name: string, manager?: EntityManager): Promise<BillConcessionSchemeEntity | null> {
    return (manager?.getRepository(BillConcessionSchemeEntity) ?? this.repo).findOne({ where: { name } });
  }

  async list(manager?: EntityManager): Promise<BillConcessionSchemeEntity[]> {
    return (manager?.getRepository(BillConcessionSchemeEntity) ?? this.repo).find({ order: { name: "ASC" } });
  }

  async create(
    data: Partial<BillConcessionSchemeEntity>,
    manager?: EntityManager,
  ): Promise<BillConcessionSchemeEntity> {
    const repo = manager?.getRepository(BillConcessionSchemeEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BillConcessionSchemeEntity, manager?: EntityManager): Promise<BillConcessionSchemeEntity> {
    return (manager?.getRepository(BillConcessionSchemeEntity) ?? this.repo).save(entity);
  }
}

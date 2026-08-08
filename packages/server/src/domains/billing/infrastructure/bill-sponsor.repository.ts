import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BillSponsorEntity } from "../domain/bill-sponsor.entity";

@Injectable()
export class BillSponsorRepository {
  constructor(
    @InjectRepository(BillSponsorEntity)
    private readonly repo: Repository<BillSponsorEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BillSponsorEntity | null> {
    return (manager?.getRepository(BillSponsorEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BillSponsorEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BillSponsor", id);
    return row;
  }

  async findByName(name: string, manager?: EntityManager): Promise<BillSponsorEntity | null> {
    return (manager?.getRepository(BillSponsorEntity) ?? this.repo).findOne({ where: { name } });
  }

  async list(manager?: EntityManager): Promise<BillSponsorEntity[]> {
    return (manager?.getRepository(BillSponsorEntity) ?? this.repo).find({ order: { name: "ASC" } });
  }

  async create(data: Partial<BillSponsorEntity>, manager?: EntityManager): Promise<BillSponsorEntity> {
    const repo = manager?.getRepository(BillSponsorEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BillSponsorEntity, manager?: EntityManager): Promise<BillSponsorEntity> {
    return (manager?.getRepository(BillSponsorEntity) ?? this.repo).save(entity);
  }
}

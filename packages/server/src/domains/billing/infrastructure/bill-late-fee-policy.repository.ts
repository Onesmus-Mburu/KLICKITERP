import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BillLateFeePolicyEntity } from "../domain/bill-late-fee-policy.entity";

@Injectable()
export class BillLateFeePolicyRepository {
  constructor(
    @InjectRepository(BillLateFeePolicyEntity)
    private readonly repo: Repository<BillLateFeePolicyEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BillLateFeePolicyEntity | null> {
    return (manager?.getRepository(BillLateFeePolicyEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BillLateFeePolicyEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BillLateFeePolicy", id);
    return row;
  }

  async findByName(name: string, manager?: EntityManager): Promise<BillLateFeePolicyEntity | null> {
    return (manager?.getRepository(BillLateFeePolicyEntity) ?? this.repo).findOne({ where: { name } });
  }

  async list(manager?: EntityManager): Promise<BillLateFeePolicyEntity[]> {
    return (manager?.getRepository(BillLateFeePolicyEntity) ?? this.repo).find({ order: { name: "ASC" } });
  }

  async create(data: Partial<BillLateFeePolicyEntity>, manager?: EntityManager): Promise<BillLateFeePolicyEntity> {
    const repo = manager?.getRepository(BillLateFeePolicyEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BillLateFeePolicyEntity, manager?: EntityManager): Promise<BillLateFeePolicyEntity> {
    return (manager?.getRepository(BillLateFeePolicyEntity) ?? this.repo).save(entity);
  }
}

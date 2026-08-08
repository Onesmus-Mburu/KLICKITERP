import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BankReconMatchEntity } from "../domain/bank-recon-match.entity";

/** Plain repository wrapper for `bank_recon_match`. */
@Injectable()
export class BankReconMatchRepository {
  constructor(
    @InjectRepository(BankReconMatchEntity)
    private readonly repo: Repository<BankReconMatchEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BankReconMatchEntity | null> {
    return (manager?.getRepository(BankReconMatchEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BankReconMatchEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BankReconMatch", id);
    return row;
  }

  async listByReconciliation(
    reconciliationId: string,
    manager?: EntityManager,
  ): Promise<BankReconMatchEntity[]> {
    return (manager?.getRepository(BankReconMatchEntity) ?? this.repo).find({
      where: { reconciliationId },
      order: { createdAt: "ASC" },
    });
  }

  async create(data: Partial<BankReconMatchEntity>, manager?: EntityManager): Promise<BankReconMatchEntity> {
    const repo = manager?.getRepository(BankReconMatchEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async delete(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(BankReconMatchEntity) ?? this.repo).delete({ id });
  }
}

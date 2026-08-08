import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BankReconciliationEntity, BankReconciliationStatus } from "../domain/bank-reconciliation.entity";

export interface ListBankReconciliationsFilter {
  accountId?: string;
  status?: BankReconciliationStatus;
}

/**
 * Plain repository wrapper for `bank_reconciliation`, plus
 * `findByAccountAndPeriod()` — BR-BANK-03's own lookup ("a period's bank
 * reconciliation must be locked before that period can be HARD_CLOSED"),
 * backed by the unique index `uq_bank_reconciliation_account_period`
 * (migration `0140`). See `BankReconciliationEntity`'s class doc comment
 * for the important, not-yet-wired cross-module flag this finder exists to
 * eventually serve.
 */
@Injectable()
export class BankReconciliationRepository {
  constructor(
    @InjectRepository(BankReconciliationEntity)
    private readonly repo: Repository<BankReconciliationEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BankReconciliationEntity | null> {
    return (manager?.getRepository(BankReconciliationEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BankReconciliationEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BankReconciliation", id);
    return row;
  }

  async findByAccountAndPeriod(
    accountId: string,
    periodId: string,
    manager?: EntityManager,
  ): Promise<BankReconciliationEntity | null> {
    return (manager?.getRepository(BankReconciliationEntity) ?? this.repo).findOne({
      where: { accountId, periodId },
    });
  }

  async list(
    filter: ListBankReconciliationsFilter = {},
    manager?: EntityManager,
  ): Promise<BankReconciliationEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.accountId !== undefined) where.accountId = filter.accountId;
    if (filter.status !== undefined) where.status = filter.status;
    return (manager?.getRepository(BankReconciliationEntity) ?? this.repo).find({
      where,
      order: { createdAt: "DESC" },
    });
  }

  async create(
    data: Partial<BankReconciliationEntity>,
    manager?: EntityManager,
  ): Promise<BankReconciliationEntity> {
    const repo = manager?.getRepository(BankReconciliationEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BankReconciliationEntity, manager?: EntityManager): Promise<BankReconciliationEntity> {
    return (manager?.getRepository(BankReconciliationEntity) ?? this.repo).save(entity);
  }
}

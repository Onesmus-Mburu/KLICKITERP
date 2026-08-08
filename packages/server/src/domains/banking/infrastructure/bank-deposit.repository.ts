import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BankDepositEntity, BankDepositWithdrawalStatus } from "../domain/bank-deposit.entity";

export interface ListBankDepositsFilter {
  status?: BankDepositWithdrawalStatus;
  accountId?: string;
}

/** Plain repository wrapper for `bank_deposit`. */
@Injectable()
export class BankDepositRepository {
  constructor(
    @InjectRepository(BankDepositEntity)
    private readonly repo: Repository<BankDepositEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BankDepositEntity | null> {
    return (manager?.getRepository(BankDepositEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BankDepositEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BankDeposit", id);
    return row;
  }

  async findByNumber(number: string, manager?: EntityManager): Promise<BankDepositEntity | null> {
    return (manager?.getRepository(BankDepositEntity) ?? this.repo).findOne({ where: { number } });
  }

  async list(filter: ListBankDepositsFilter = {}, manager?: EntityManager): Promise<BankDepositEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.status !== undefined) where.status = filter.status;
    if (filter.accountId !== undefined) where.accountId = filter.accountId;
    return (manager?.getRepository(BankDepositEntity) ?? this.repo).find({ where, order: { createdAt: "DESC" } });
  }

  async create(data: Partial<BankDepositEntity>, manager?: EntityManager): Promise<BankDepositEntity> {
    const repo = manager?.getRepository(BankDepositEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BankDepositEntity, manager?: EntityManager): Promise<BankDepositEntity> {
    return (manager?.getRepository(BankDepositEntity) ?? this.repo).save(entity);
  }
}

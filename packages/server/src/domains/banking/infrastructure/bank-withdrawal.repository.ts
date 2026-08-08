import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BankWithdrawalEntity } from "../domain/bank-withdrawal.entity";
import { BankDepositWithdrawalStatus } from "../domain/bank-deposit.entity";

export interface ListBankWithdrawalsFilter {
  status?: BankDepositWithdrawalStatus;
  accountId?: string;
}

/** Plain repository wrapper for `bank_withdrawal`. */
@Injectable()
export class BankWithdrawalRepository {
  constructor(
    @InjectRepository(BankWithdrawalEntity)
    private readonly repo: Repository<BankWithdrawalEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BankWithdrawalEntity | null> {
    return (manager?.getRepository(BankWithdrawalEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BankWithdrawalEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BankWithdrawal", id);
    return row;
  }

  async findByNumber(number: string, manager?: EntityManager): Promise<BankWithdrawalEntity | null> {
    return (manager?.getRepository(BankWithdrawalEntity) ?? this.repo).findOne({ where: { number } });
  }

  async list(filter: ListBankWithdrawalsFilter = {}, manager?: EntityManager): Promise<BankWithdrawalEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.status !== undefined) where.status = filter.status;
    if (filter.accountId !== undefined) where.accountId = filter.accountId;
    return (manager?.getRepository(BankWithdrawalEntity) ?? this.repo).find({
      where,
      order: { createdAt: "DESC" },
    });
  }

  async create(data: Partial<BankWithdrawalEntity>, manager?: EntityManager): Promise<BankWithdrawalEntity> {
    const repo = manager?.getRepository(BankWithdrawalEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BankWithdrawalEntity, manager?: EntityManager): Promise<BankWithdrawalEntity> {
    return (manager?.getRepository(BankWithdrawalEntity) ?? this.repo).save(entity);
  }
}

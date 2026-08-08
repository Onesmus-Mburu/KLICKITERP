import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BankAccountEntity, BankAccountKind } from "../domain/bank-account.entity";

export interface ListBankAccountsFilter {
  kind?: BankAccountKind;
  isActive?: boolean;
}

/** Plain repository wrapper for `bank_account`, plus `findByGlAccountId()`. */
@Injectable()
export class BankAccountRepository {
  constructor(
    @InjectRepository(BankAccountEntity)
    private readonly repo: Repository<BankAccountEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BankAccountEntity | null> {
    return (manager?.getRepository(BankAccountEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BankAccountEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BankAccount", id);
    return row;
  }

  async findByName(name: string, manager?: EntityManager): Promise<BankAccountEntity | null> {
    return (manager?.getRepository(BankAccountEntity) ?? this.repo).findOne({ where: { name } });
  }

  /** `bank_account.gl_account_id` is UNIQUE — at most one bank account maps to a given GL account. */
  async findByGlAccountId(glAccountId: string, manager?: EntityManager): Promise<BankAccountEntity | null> {
    return (manager?.getRepository(BankAccountEntity) ?? this.repo).findOne({ where: { glAccountId } });
  }

  async list(filter: ListBankAccountsFilter = {}, manager?: EntityManager): Promise<BankAccountEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.kind !== undefined) where.kind = filter.kind;
    if (filter.isActive !== undefined) where.isActive = filter.isActive;
    return (manager?.getRepository(BankAccountEntity) ?? this.repo).find({ where, order: { name: "ASC" } });
  }

  async create(data: Partial<BankAccountEntity>, manager?: EntityManager): Promise<BankAccountEntity> {
    const repo = manager?.getRepository(BankAccountEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BankAccountEntity, manager?: EntityManager): Promise<BankAccountEntity> {
    return (manager?.getRepository(BankAccountEntity) ?? this.repo).save(entity);
  }
}

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BankChequeBookEntity } from "../domain/bank-cheque-book.entity";

export interface ListBankChequeBooksFilter {
  accountId?: string;
}

/** Plain repository wrapper for `bank_cheque_book`. */
@Injectable()
export class BankChequeBookRepository {
  constructor(
    @InjectRepository(BankChequeBookEntity)
    private readonly repo: Repository<BankChequeBookEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BankChequeBookEntity | null> {
    return (manager?.getRepository(BankChequeBookEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BankChequeBookEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BankChequeBook", id);
    return row;
  }

  async list(filter: ListBankChequeBooksFilter = {}, manager?: EntityManager): Promise<BankChequeBookEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.accountId !== undefined) where.accountId = filter.accountId;
    return (manager?.getRepository(BankChequeBookEntity) ?? this.repo).find({
      where,
      order: { createdAt: "DESC" },
    });
  }

  async create(data: Partial<BankChequeBookEntity>, manager?: EntityManager): Promise<BankChequeBookEntity> {
    const repo = manager?.getRepository(BankChequeBookEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BankChequeBookEntity, manager?: EntityManager): Promise<BankChequeBookEntity> {
    return (manager?.getRepository(BankChequeBookEntity) ?? this.repo).save(entity);
  }
}

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BankStatementImportEntity } from "../domain/bank-statement-import.entity";

export interface ListBankStatementImportsFilter {
  accountId?: string;
}

/** Plain repository wrapper for `bank_statement_import`. */
@Injectable()
export class BankStatementImportRepository {
  constructor(
    @InjectRepository(BankStatementImportEntity)
    private readonly repo: Repository<BankStatementImportEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BankStatementImportEntity | null> {
    return (manager?.getRepository(BankStatementImportEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BankStatementImportEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BankStatementImport", id);
    return row;
  }

  async list(
    filter: ListBankStatementImportsFilter = {},
    manager?: EntityManager,
  ): Promise<BankStatementImportEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.accountId !== undefined) where.accountId = filter.accountId;
    return (manager?.getRepository(BankStatementImportEntity) ?? this.repo).find({
      where,
      order: { createdAt: "DESC" },
    });
  }

  async create(
    data: Partial<BankStatementImportEntity>,
    manager?: EntityManager,
  ): Promise<BankStatementImportEntity> {
    const repo = manager?.getRepository(BankStatementImportEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }
}

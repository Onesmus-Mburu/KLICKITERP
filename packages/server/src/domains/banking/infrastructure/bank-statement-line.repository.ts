import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BankStatementLineEntity, BankStatementLineReconState } from "../domain/bank-statement-line.entity";

export interface ListBankStatementLinesFilter {
  accountId?: string;
  importId?: string;
  reconState?: BankStatementLineReconState;
}

/**
 * Plain repository wrapper for `bank_statement_line`, plus
 * `findUnmatchedForAccount()` — the reconciliation-workspace lookup
 * (FR-BANK-004.1), backed by the partial index `ix_bank_stmt_unmatched_p`
 * (migration `0140`).
 */
@Injectable()
export class BankStatementLineRepository {
  constructor(
    @InjectRepository(BankStatementLineEntity)
    private readonly repo: Repository<BankStatementLineEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BankStatementLineEntity | null> {
    return (manager?.getRepository(BankStatementLineEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BankStatementLineEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BankStatementLine", id);
    return row;
  }

  async list(filter: ListBankStatementLinesFilter = {}, manager?: EntityManager): Promise<BankStatementLineEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.accountId !== undefined) where.accountId = filter.accountId;
    if (filter.importId !== undefined) where.importId = filter.importId;
    if (filter.reconState !== undefined) where.reconState = filter.reconState;
    return (manager?.getRepository(BankStatementLineEntity) ?? this.repo).find({
      where,
      order: { lineDate: "ASC" },
    });
  }

  /**
   * Unmatched lines for an account (`ix_bank_stmt_unmatched_p`'s own
   * lookup) — the reconciliation workspace's candidate list (FR-BANK-004.1).
   */
  async findUnmatchedForAccount(
    accountId: string,
    manager?: EntityManager,
  ): Promise<BankStatementLineEntity[]> {
    return (manager?.getRepository(BankStatementLineEntity) ?? this.repo)
      .createQueryBuilder("line")
      .where("line.accountId = :accountId", { accountId })
      .andWhere("line.reconState = :reconState", { reconState: "UNMATCHED" })
      .orderBy("line.lineDate", "ASC")
      .getMany();
  }

  /**
   * BR-BANK-02's own dedupe-on-reimport lookup (`uq_bank_stmt_line_dedupe`)
   * — `BankStatementImportService.importLines()`'s check-then-skip step
   * (duplicates on reimport are an expected, non-exceptional case; the DB
   * unique index is the real backstop, this is just a friendlier read
   * before the insert is even attempted).
   */
  async findByAccountAndDedupeHash(
    accountId: string,
    dedupeHash: string,
    manager?: EntityManager,
  ): Promise<BankStatementLineEntity | null> {
    return (manager?.getRepository(BankStatementLineEntity) ?? this.repo).findOne({
      where: { accountId, dedupeHash },
    });
  }

  async create(data: Partial<BankStatementLineEntity>, manager?: EntityManager): Promise<BankStatementLineEntity> {
    const repo = manager?.getRepository(BankStatementLineEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BankStatementLineEntity, manager?: EntityManager): Promise<BankStatementLineEntity> {
    return (manager?.getRepository(BankStatementLineEntity) ?? this.repo).save(entity);
  }
}

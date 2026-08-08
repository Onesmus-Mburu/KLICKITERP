import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BankChequeLeafEntity, BankChequeLeafStatus } from "../domain/bank-cheque-leaf.entity";

export interface ListBankChequeLeavesFilter {
  bookId?: string;
  status?: BankChequeLeafStatus;
}

/**
 * Plain repository wrapper for `bank_cheque_leaf`, plus `findNextUnused()` —
 * BR-BANK-04's sequential-issuance lookup ("cheque numbers issue
 * sequentially per cheque book").
 */
@Injectable()
export class BankChequeLeafRepository {
  constructor(
    @InjectRepository(BankChequeLeafEntity)
    private readonly repo: Repository<BankChequeLeafEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BankChequeLeafEntity | null> {
    return (manager?.getRepository(BankChequeLeafEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BankChequeLeafEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BankChequeLeaf", id);
    return row;
  }

  async findByBookAndLeafNo(
    bookId: string,
    leafNo: number,
    manager?: EntityManager,
  ): Promise<BankChequeLeafEntity | null> {
    return (manager?.getRepository(BankChequeLeafEntity) ?? this.repo).findOne({ where: { bookId, leafNo } });
  }

  /**
   * Lowest-numbered `UNUSED` leaf in the book — the sequential-issuance
   * candidate (BR-BANK-04). Returns `null` when the book has no remaining
   * unused leaves.
   */
  async findNextUnused(bookId: string, manager?: EntityManager): Promise<BankChequeLeafEntity | null> {
    return (manager?.getRepository(BankChequeLeafEntity) ?? this.repo)
      .createQueryBuilder("leaf")
      .where("leaf.bookId = :bookId", { bookId })
      .andWhere("leaf.status = :status", { status: "UNUSED" })
      .orderBy("leaf.leafNo", "ASC")
      .getOne();
  }

  async list(filter: ListBankChequeLeavesFilter = {}, manager?: EntityManager): Promise<BankChequeLeafEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.bookId !== undefined) where.bookId = filter.bookId;
    if (filter.status !== undefined) where.status = filter.status;
    return (manager?.getRepository(BankChequeLeafEntity) ?? this.repo).find({
      where,
      order: { leafNo: "ASC" },
    });
  }

  async create(data: Partial<BankChequeLeafEntity>, manager?: EntityManager): Promise<BankChequeLeafEntity> {
    const repo = manager?.getRepository(BankChequeLeafEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BankChequeLeafEntity, manager?: EntityManager): Promise<BankChequeLeafEntity> {
    return (manager?.getRepository(BankChequeLeafEntity) ?? this.repo).save(entity);
  }
}

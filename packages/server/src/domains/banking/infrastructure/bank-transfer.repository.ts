import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BankTransferEntity, BankTransferStatus } from "../domain/bank-transfer.entity";

export interface ListBankTransfersFilter {
  status?: BankTransferStatus;
  accountId?: string;
}

/** Plain repository wrapper for `bank_transfer`. */
@Injectable()
export class BankTransferRepository {
  constructor(
    @InjectRepository(BankTransferEntity)
    private readonly repo: Repository<BankTransferEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BankTransferEntity | null> {
    return (manager?.getRepository(BankTransferEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BankTransferEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BankTransfer", id);
    return row;
  }

  async findByNumber(number: string, manager?: EntityManager): Promise<BankTransferEntity | null> {
    return (manager?.getRepository(BankTransferEntity) ?? this.repo).findOne({ where: { number } });
  }

  /** Matches transfers where the given account is either leg (from OR to). */
  async list(filter: ListBankTransfersFilter = {}, manager?: EntityManager): Promise<BankTransferEntity[]> {
    const repo = manager?.getRepository(BankTransferEntity) ?? this.repo;
    const qb = repo.createQueryBuilder("t").orderBy("t.createdAt", "DESC");
    if (filter.status !== undefined) qb.andWhere("t.status = :status", { status: filter.status });
    if (filter.accountId !== undefined) {
      qb.andWhere("(t.fromAccountId = :accountId OR t.toAccountId = :accountId)", {
        accountId: filter.accountId,
      });
    }
    return qb.getMany();
  }

  async create(data: Partial<BankTransferEntity>, manager?: EntityManager): Promise<BankTransferEntity> {
    const repo = manager?.getRepository(BankTransferEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BankTransferEntity, manager?: EntityManager): Promise<BankTransferEntity> {
    return (manager?.getRepository(BankTransferEntity) ?? this.repo).save(entity);
  }
}

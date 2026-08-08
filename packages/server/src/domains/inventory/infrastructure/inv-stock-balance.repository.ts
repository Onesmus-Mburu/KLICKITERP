import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { InvStockBalanceEntity } from "../domain/inv-stock-balance.entity";

/**
 * Plain repository wrapper for `inv_stock_balance`, plus
 * `findByIdForUpdate()` — the load-bearing pessimistic row lock every
 * receipt/issue/transfer/adjustment path in the next pass's weighted-average
 * stock-movement engine will use (BR-INV-01/FR-INV-006.1), mirroring
 * `WallWalletRepository.findByIdForUpdate()`'s exact locking discipline
 * (`SELECT ... FOR UPDATE` via TypeORM's `lock: { mode: "pessimistic_write" }`).
 */
@Injectable()
export class InvStockBalanceRepository {
  constructor(
    @InjectRepository(InvStockBalanceEntity)
    private readonly repo: Repository<InvStockBalanceEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<InvStockBalanceEntity | null> {
    return (manager?.getRepository(InvStockBalanceEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<InvStockBalanceEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("InvStockBalance", id);
    return row;
  }

  async findByItemStore(
    itemId: string,
    storeId: string,
    manager?: EntityManager,
  ): Promise<InvStockBalanceEntity | null> {
    return (manager?.getRepository(InvStockBalanceEntity) ?? this.repo).findOne({ where: { itemId, storeId } });
  }

  /**
   * `SELECT ... FOR UPDATE` on the (item, store) balance row — MUST be
   * called inside the caller's own open transaction (a lock only means
   * something inside one). Returns `null` if no balance row exists yet for
   * this (item, store) pair (the next pass's engine is expected to
   * lazily-create one on first movement, the same `getOrCreateWallet()`
   * pattern `WalletsService` established).
   */
  async findByIdForUpdate(
    em: EntityManager,
    itemId: string,
    storeId: string,
  ): Promise<InvStockBalanceEntity | null> {
    return em.getRepository(InvStockBalanceEntity).findOne({
      where: { itemId, storeId },
      lock: { mode: "pessimistic_write" },
    });
  }

  async listByStore(storeId: string, manager?: EntityManager): Promise<InvStockBalanceEntity[]> {
    return (manager?.getRepository(InvStockBalanceEntity) ?? this.repo).find({ where: { storeId } });
  }

  async create(data: Partial<InvStockBalanceEntity>, manager?: EntityManager): Promise<InvStockBalanceEntity> {
    const repo = manager?.getRepository(InvStockBalanceEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: InvStockBalanceEntity, manager?: EntityManager): Promise<InvStockBalanceEntity> {
    return (manager?.getRepository(InvStockBalanceEntity) ?? this.repo).save(entity);
  }
}

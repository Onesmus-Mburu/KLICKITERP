import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ExpPettyCashFloatEntity } from "../domain/exp-petty-cash-float.entity";

/**
 * Plain repository wrapper for `exp_petty_cash_float`, plus
 * `findByIdForUpdate()` — the load-bearing pessimistic row lock the next
 * pass's petty-cash-spend/replenish engine will use (BR-EXP-02), mirroring
 * `WallWalletRepository`/`InvStockBalanceRepository.findByIdForUpdate()`'s
 * exact locking discipline (`SELECT ... FOR UPDATE` via TypeORM's
 * `lock: { mode: "pessimistic_write" }`).
 */
@Injectable()
export class ExpPettyCashFloatRepository {
  constructor(
    @InjectRepository(ExpPettyCashFloatEntity)
    private readonly repo: Repository<ExpPettyCashFloatEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ExpPettyCashFloatEntity | null> {
    return (manager?.getRepository(ExpPettyCashFloatEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ExpPettyCashFloatEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ExpPettyCashFloat", id);
    return row;
  }

  async findByCustodianUserId(
    custodianUserId: string,
    manager?: EntityManager,
  ): Promise<ExpPettyCashFloatEntity | null> {
    return (manager?.getRepository(ExpPettyCashFloatEntity) ?? this.repo).findOne({ where: { custodianUserId } });
  }

  /**
   * `SELECT ... FOR UPDATE` on the float row — MUST be called inside the
   * caller's own open transaction (a lock only means something inside one).
   */
  async findByIdForUpdate(em: EntityManager, floatId: string): Promise<ExpPettyCashFloatEntity | null> {
    return em.getRepository(ExpPettyCashFloatEntity).findOne({
      where: { id: floatId },
      lock: { mode: "pessimistic_write" },
    });
  }

  async listAll(manager?: EntityManager): Promise<ExpPettyCashFloatEntity[]> {
    return (manager?.getRepository(ExpPettyCashFloatEntity) ?? this.repo).find();
  }

  async create(data: Partial<ExpPettyCashFloatEntity>, manager?: EntityManager): Promise<ExpPettyCashFloatEntity> {
    const repo = manager?.getRepository(ExpPettyCashFloatEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ExpPettyCashFloatEntity, manager?: EntityManager): Promise<ExpPettyCashFloatEntity> {
    return (manager?.getRepository(ExpPettyCashFloatEntity) ?? this.repo).save(entity);
  }
}

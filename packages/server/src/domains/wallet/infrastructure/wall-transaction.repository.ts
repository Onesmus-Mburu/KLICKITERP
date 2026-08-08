import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { Money } from "../../../shared/money/money";
import { WallTransactionEntity } from "../domain/wall-transaction.entity";

/**
 * Plain repository wrapper for the append-only `wall_transaction` table,
 * plus `sumSpendToday()` — the daily-limit check's aggregate query
 * (`WHERE type='SPEND' AND at::date = CURRENT_DATE`), always called under
 * the wallet's own row lock (`WallWalletRepository.findByIdForUpdate()`) so
 * two concurrent spends against the same wallet serialize correctly and can
 * never both observe a stale "under the limit" reading. `ix_wall_txn_wallet_at
 * (wallet_id, at DESC)` (migration `0090`) serves this query.
 */
@Injectable()
export class WallTransactionRepository {
  constructor(
    @InjectRepository(WallTransactionEntity)
    private readonly repo: Repository<WallTransactionEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<WallTransactionEntity | null> {
    return (manager?.getRepository(WallTransactionEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<WallTransactionEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("WallTransaction", id);
    return row;
  }

  async findByIdempotencyKey(idempotencyKey: string, manager?: EntityManager): Promise<WallTransactionEntity | null> {
    return (manager?.getRepository(WallTransactionEntity) ?? this.repo).findOne({ where: { idempotencyKey } });
  }

  async listByWallet(walletId: string, manager?: EntityManager): Promise<WallTransactionEntity[]> {
    return (manager?.getRepository(WallTransactionEntity) ?? this.repo).find({
      where: { walletId },
      order: { at: "DESC" },
    });
  }

  /** `transferToWallet()`'s idempotency replay uses this to recover BOTH legs (out+in) of a prior call from their shared journal_id. */
  async listByJournalId(journalId: string, manager?: EntityManager): Promise<WallTransactionEntity[]> {
    return (manager?.getRepository(WallTransactionEntity) ?? this.repo).find({ where: { journalId } });
  }

  /** BR-WALL-02/FR-WALL-009.1's daily-SPEND-limit aggregate — see class doc comment. */
  async sumSpendToday(em: EntityManager, walletId: string): Promise<Money> {
    const row: { total: string | null } | undefined = await em
      .getRepository(WallTransactionEntity)
      .createQueryBuilder("t")
      .select("COALESCE(SUM(t.amount), 0)", "total")
      .where("t.walletId = :walletId", { walletId })
      .andWhere("t.type = 'SPEND'")
      .andWhere("t.at::date = CURRENT_DATE")
      .getRawOne();
    return Money.fromDecimalString(row?.total ?? "0");
  }

  async create(data: Partial<WallTransactionEntity>, manager: EntityManager): Promise<WallTransactionEntity> {
    const repo = manager.getRepository(WallTransactionEntity);
    return repo.save(repo.create(data));
  }

  /**
   * Phase 6 Slice 12 (Part A) — cross-references an already-inserted
   * `wall_transaction` row to the wallet-funded `pay_receipt`
   * `ReceiptsService.recordWalletFundedReceipt()` creates just AFTER this
   * row (the receipt's own `walletTransactionId` input needs this row's id
   * first, so the FK can only be set in a second, targeted step). A plain
   * `UPDATE`, not a `.save()` of a stale in-memory entity —
   * `wall_transaction` carries no immutability trigger (unlike
   * `pay_receipt`'s `trg_pay_receipt_immutable`), so this is a legitimate,
   * safe in-place update of this normally-append-only table's one
   * genuinely late-bound column.
   */
  async updateReceiptId(id: string, receiptId: string, em: EntityManager): Promise<void> {
    await em.getRepository(WallTransactionEntity).update({ id }, { receiptId });
  }
}

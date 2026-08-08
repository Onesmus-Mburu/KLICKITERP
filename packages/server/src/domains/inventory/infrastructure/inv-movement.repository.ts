import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { InvMovementEntity } from "../domain/inv-movement.entity";

/**
 * Plain repository wrapper for the append-only `inv_movement` ledger, plus
 * `listForItemStore()` — the movement-history query the next pass's
 * item-card/valuation-report screens need, served by
 * `ix_inv_movement_item_store_at (item_id, store_id, at DESC)` (migration
 * `0110`). No `save()`/update method is exposed here on purpose — this
 * table is append-only (`trg_inv_movement_immutable` enforces it at the DB
 * layer too), so only `create()` exists.
 */
@Injectable()
export class InvMovementRepository {
  constructor(
    @InjectRepository(InvMovementEntity)
    private readonly repo: Repository<InvMovementEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<InvMovementEntity | null> {
    return (manager?.getRepository(InvMovementEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<InvMovementEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("InvMovement", id);
    return row;
  }

  /** Movement history for one (item, store) pair, most-recent first — served by `ix_inv_movement_item_store_at`. */
  async listForItemStore(
    itemId: string,
    storeId: string,
    manager?: EntityManager,
  ): Promise<InvMovementEntity[]> {
    return (manager?.getRepository(InvMovementEntity) ?? this.repo).find({
      where: { itemId, storeId },
      order: { at: "DESC" },
    });
  }

  async listByRefDoc(
    refDocType: string,
    refDocId: string,
    manager?: EntityManager,
  ): Promise<InvMovementEntity[]> {
    return (manager?.getRepository(InvMovementEntity) ?? this.repo).find({ where: { refDocType, refDocId } });
  }

  async create(data: Partial<InvMovementEntity>, manager: EntityManager): Promise<InvMovementEntity> {
    const repo = manager.getRepository(InvMovementEntity);
    return repo.save(repo.create(data));
  }
}

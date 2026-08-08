import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { InvItemRepository } from "../infrastructure/inv-item.repository";
import { InvMovementRepository } from "../infrastructure/inv-movement.repository";
import { InvStockBalanceRepository } from "../infrastructure/inv-stock-balance.repository";
import { InvStockTakeRepository } from "../infrastructure/inv-stock-take.repository";
import { InvMovementEntity, InvMovementType } from "../domain/inv-movement.entity";
import { InvStockTakeStatus } from "../domain/inv-stock-take.entity";
import { isItemInScope } from "./stock-take-scope.util";
import {
  computeWeightedAverageCost,
  qtyAdd,
  qtyIsNegative,
  qtyIsPositive,
  qtyIsZero,
  qtyNegate,
  qtyTimesCostToMoney,
} from "./decimal-qty.util";

/** BR-INV-03 — statuses whose scoped items/store are frozen against new movements. `APPROVED` is deliberately excluded (see class doc comment "post()-time freeze release"). */
const FROZEN_STOCK_TAKE_STATUSES: readonly InvStockTakeStatus[] = ["OPEN", "COUNTING", "REVIEW", "PENDING_APPROVAL"];

export interface RecordReceiptInput {
  itemId: string;
  storeId: string;
  /** Positive decimal string, scale <=4 (NUMERIC(14,4)). */
  qty: string;
  /** Decimal string, scale <=6 (NUMERIC(18,6)) — the cost this receipt is valued at. */
  unitCost: string;
  refDocType: string;
  refDocId: string;
  departmentId?: string | null;
  idempotencyKey?: string | null;
}

export interface RecordIssueInput {
  itemId: string;
  storeId: string;
  /** Positive decimal string — the quantity being taken OUT of stock. */
  qty: string;
  refDocType: string;
  refDocId: string;
  departmentId?: string | null;
  idempotencyKey?: string | null;
}

export interface RecordReturnInput {
  itemId: string;
  storeId: string;
  qty: string;
  refDocType: string;
  refDocId: string;
  departmentId?: string | null;
  idempotencyKey?: string | null;
}

export interface RecordAdjustmentInput {
  itemId: string;
  storeId: string;
  /** Signed decimal string — positive = gain (found stock), negative = loss. */
  qtyDelta: string;
  /** Decimal string, scale <=6 — the cost basis this adjustment is valued at (typically the item's current avg_cost, caller's choice). */
  unitCost: string;
  refDocType: string;
  refDocId: string;
  /**
   * `StockTakesService.post()`'s own `inv_stock_take.id` — see class doc
   * comment "post()-time freeze release". `inv_stock_take` has no `APPROVED`
   * status (only `PENDING_APPROVAL` through to `POSTED`, by design — see
   * `StockTakesService.onApprovalDecided()`'s own doc comment), so excluding
   * `APPROVED` from `FROZEN_STOCK_TAKE_STATUSES` alone can never let a stock
   * take's own `post()` realize its counted variance: `assertNotFrozen()`
   * would otherwise always find THIS SAME stock take still `PENDING_APPROVAL`
   * (status only flips to `POSTED` after every line's movement is recorded)
   * and reject itself. Passing the id here excludes it from that specific
   * check, without weakening BR-INV-03 against any OTHER open/pending take.
   */
  excludeStockTakeId?: string;
}

export interface RecordTransferOutInput {
  itemId: string;
  storeId: string;
  qty: string;
  refDocType: string;
  refDocId: string;
}

export interface RecordTransferInInput {
  itemId: string;
  storeId: string;
  qty: string;
  /** The unit cost captured on the transfer line at issue time — see `TransfersService.receive()`'s doc comment. */
  unitCost: string;
  refDocType: string;
  refDocId: string;
}

interface ApplyMovementArgs {
  itemId: string;
  storeId: string;
  movementType: InvMovementType;
  /** Signed decimal string — the sign IS the direction (positive=inbound, negative=outbound). */
  signedQty: string;
  unitCost: string;
  refDocType: string;
  refDocId: string;
  departmentId?: string | null;
  /** Whether this movement recalculates `inv_item.avg_cost` (FR-INV-006.1) — true for inbound movements with an independent cost basis (RECEIPT/RETURN/TRANSFER_IN), false otherwise. */
  recalcAverage: boolean;
  /** See `RecordAdjustmentInput.excludeStockTakeId`'s doc comment. */
  excludeStockTakeId?: string;
}

/**
 * THE core weighted-average stock-movement engine (FR-INV-003.1/006.1,
 * BR-INV-01/03), mirroring `WalletTransactionsService`'s design exactly:
 * every public method takes the caller's own `EntityManager` (composable, no
 * transaction opened here) and locks the `inv_stock_balance` row internally
 * via `InvStockBalanceRepository.findByIdForUpdate()` before mutating it.
 * None of these methods call `PostingService` — this module records the
 * PHYSICAL/valuation side-effect only; a caller composing a GL posting (e.g.
 * `domains/procurement`'s `GrnService`, or this module's own
 * `StockTakesService.post()`) reads the returned `InvMovementEntity`/
 * `inv_stock_balance` state and builds its own journal in the SAME
 * transaction.
 *
 * **Idempotency, honestly**: unlike `wall_transaction`, `inv_movement`
 * carries NO `idempotency_key` column in the foundation pass's schema (see
 * that entity's doc comment — the DDL simply doesn't have one). Every
 * `recordX()` method still accepts an optional `idempotencyKey` parameter
 * for interface parity with `WalletTransactionsService`'s own discipline,
 * but it is NOT separately persisted or queried. Instead, replay-safety
 * comes from `(refDocType, refDocId, movementType)` — before inserting a new
 * movement, `InvMovementRepository.listByRefDoc()` is checked for an
 * existing row of the same `movementType` against the same ref document; if
 * found, it is returned unchanged rather than duplicated. This is arguably a
 * BETTER idempotency key than an opaque caller-supplied string anyway (the
 * ref document already uniquely identifies the source event — a GRN line, a
 * transfer line, a stock-take line, a POS sale id), so every caller should
 * pass a stable `refDocId` to get replay-safety for free; `idempotencyKey`
 * is accepted-but-unused, documented here rather than silently dropped.
 *
 * **BR-INV-03 freeze** (`assertNotFrozen()`) runs before EVERY movement type
 * this service records, including RECEIPT/RETURN — broader than the task
 * brief's own enumerated examples ("issue/sale/adjustment/transfer"), a
 * deliberate choice: BR-INV-03's rule text itself ("movements on counted
 * items are blocked") is unqualified by movement type, and a delivery
 * arriving mid-count would corrupt the snapshot exactly the same way an
 * issue would. See `stock-take-scope.util.ts` for the `scope` jsonb shape
 * this check consults.
 *
 * **`post()`-time freeze release**: `inv_stock_take` has no `APPROVED`
 * status of its own — it stays `PENDING_APPROVAL` all the way through
 * `post()` (readiness is instead verified against the underlying
 * `appr_instance`'s status — see `StockTakesService.onApprovalDecided()`'s
 * doc comment), so `PENDING_APPROVAL` must stay in `FROZEN_STOCK_TAKE_STATUSES`
 * to actually protect a stock take that's still mid-approval. That means
 * `StockTakesService.post()` itself calling `recordAdjustment()` against its
 * OWN counted items would otherwise always self-block on its own
 * still-`PENDING_APPROVAL` freeze the instant it tried to realize the
 * counted variance (status only flips to `POSTED` after every line's
 * movement is recorded) — `recordAdjustment()`'s `excludeStockTakeId`
 * parameter is exactly this release valve: it excludes ONE specific,
 * already-approved (`appr_instance`-verified) stock take by id from its own
 * freeze check, without weakening BR-INV-03 against any OTHER open/pending
 * take covering the same item/store.
 *
 * **`inv_item.avg_cost` locking note**: only the `inv_stock_balance` row is
 * pessimistic-locked (mirroring `WallWalletRepository.findByIdForUpdate()`'s
 * single-lock-target discipline); the `inv_item` row itself is read/written
 * without its own lock. Since `avg_cost` lives on `inv_item` (a single value
 * per item, not per item+store — the DDL's own shape, see that entity's doc
 * comment), and only the SAME (item, store) balance lock serializes
 * concurrent movements for the common case (multiple movements to one
 * store), two concurrent RECEIPTs to the SAME item at DIFFERENT stores could
 * theoretically race on this shared cache field — a documented, accepted
 * minor gap (the same class of judgement call the foundation pass's "no
 * writer-guard trigger" note already made for this table pair), not solved
 * here to avoid over-engineering a single-writer-module concern.
 */
@Injectable()
export class StockMovementsService {
  constructor(
    private readonly stockBalanceRepository: InvStockBalanceRepository,
    private readonly movementRepository: InvMovementRepository,
    private readonly itemRepository: InvItemRepository,
    private readonly stockTakeRepository: InvStockTakeRepository,
  ) {}

  /** RECEIPT — recalculates `inv_item.avg_cost` per FR-INV-006.1's exact formula. */
  async recordReceipt(em: EntityManager, input: RecordReceiptInput): Promise<InvMovementEntity> {
    this.assertPositiveQty(input.qty, "recordReceipt");
    const existing = await this.findExistingByRefDoc(em, input.refDocType, input.refDocId, "RECEIPT");
    if (existing) return existing;

    return this.applyMovement(em, {
      itemId: input.itemId,
      storeId: input.storeId,
      movementType: "RECEIPT",
      signedQty: input.qty,
      unitCost: input.unitCost,
      refDocType: input.refDocType,
      refDocId: input.refDocId,
      departmentId: input.departmentId ?? null,
      recalcAverage: true,
    });
  }

  /** ISSUE — BR-INV-01 shortage rejection (defense-in-depth ahead of `ck_inv_stock_balance_qty_nonneg`); valued at CURRENT `inv_item.avg_cost`, no recalculation. */
  async recordIssue(em: EntityManager, input: RecordIssueInput): Promise<InvMovementEntity> {
    return this.recordOutbound(em, input, "ISSUE");
  }

  /** SALE — thin wrapper around the same issue mechanics with a distinct audit trail (`movement_type='SALE'`). See class doc comment for the future POS/uniform-sale caller note. */
  async recordSale(em: EntityManager, input: RecordIssueInput): Promise<InvMovementEntity> {
    return this.recordOutbound(em, input, "SALE");
  }

  /**
   * RETURN — positive signed qty back into stock. Traces the ORIGINAL
   * movement's cost via `(refDocType, refDocId)` if an ISSUE/SALE movement
   * was already recorded against the SAME ref document (e.g. a return note
   * referencing the sale/issue it reverses); falls back to the item's
   * current `avg_cost` when no such trace exists. Recalculates the weighted
   * average, the same "inbound with an independent cost basis" treatment
   * RECEIPT gets.
   */
  async recordReturn(em: EntityManager, input: RecordReturnInput): Promise<InvMovementEntity> {
    this.assertPositiveQty(input.qty, "recordReturn");
    const existing = await this.findExistingByRefDoc(em, input.refDocType, input.refDocId, "RETURN");
    if (existing) return existing;

    const priorMovements = await this.movementRepository.listByRefDoc(input.refDocType, input.refDocId, em);
    const original = priorMovements.find((m) => m.movementType === "ISSUE" || m.movementType === "SALE");
    const unitCost = original ? original.unitCost : (await this.itemRepository.findByIdOrFail(input.itemId, em)).avgCost;

    return this.applyMovement(em, {
      itemId: input.itemId,
      storeId: input.storeId,
      movementType: "RETURN",
      signedQty: input.qty,
      unitCost,
      refDocType: input.refDocType,
      refDocId: input.refDocId,
      departmentId: input.departmentId ?? null,
      recalcAverage: true,
    });
  }

  /**
   * ADJUSTMENT — the low-level primitive `StockTakesService.post()` calls
   * per counted line (signed `qtyDelta`, positive=gain/negative=loss). Does
   * NOT itself post GL and does NOT recalculate `inv_item.avg_cost` (the
   * task brief's own scope for this method) — only `inv_stock_balance.qty`/
   * `.value` move by exactly `qtyDelta`/`qtyDelta * unitCost`.
   */
  async recordAdjustment(em: EntityManager, input: RecordAdjustmentInput): Promise<InvMovementEntity> {
    if (qtyIsZero(input.qtyDelta)) {
      throw new ValidationException("StockMovementsService.recordAdjustment: qtyDelta must be nonzero");
    }
    const existing = await this.findExistingByRefDoc(em, input.refDocType, input.refDocId, "ADJUSTMENT");
    if (existing) return existing;

    return this.applyMovement(em, {
      itemId: input.itemId,
      storeId: input.storeId,
      movementType: "ADJUSTMENT",
      signedQty: input.qtyDelta,
      unitCost: input.unitCost,
      refDocType: input.refDocType,
      refDocId: input.refDocId,
      departmentId: null,
      recalcAverage: false,
      excludeStockTakeId: input.excludeStockTakeId,
    });
  }

  /**
   * TRANSFER_OUT — `TransfersService.issue()`'s per-line primitive at the
   * SOURCE store. Same mechanics as `recordIssue()` (valued at current
   * `avg_cost`, no recalculation) with a distinct `movement_type`, exposed
   * as its own method rather than a private helper so `TransfersService`
   * (a different class/file) can call it directly without duplicating the
   * lock/weighted-average logic.
   */
  async recordTransferOut(em: EntityManager, input: RecordTransferOutInput): Promise<InvMovementEntity> {
    return this.recordOutbound(em, input, "TRANSFER_OUT");
  }

  /**
   * TRANSFER_IN — `TransfersService.receive()`'s per-line primitive at the
   * DESTINATION store, valued at the ORIGINAL `unit_cost` captured on the
   * `inv_transfer_line` at issue time (the caller's job to supply — this
   * method does not re-derive it). Recalculates the destination store's
   * weighted average, the same "inbound with an independent cost basis"
   * treatment RECEIPT/RETURN get.
   */
  async recordTransferIn(em: EntityManager, input: RecordTransferInInput): Promise<InvMovementEntity> {
    this.assertPositiveQty(input.qty, "recordTransferIn");
    const existing = await this.findExistingByRefDoc(em, input.refDocType, input.refDocId, "TRANSFER_IN");
    if (existing) return existing;

    return this.applyMovement(em, {
      itemId: input.itemId,
      storeId: input.storeId,
      movementType: "TRANSFER_IN",
      signedQty: input.qty,
      unitCost: input.unitCost,
      refDocType: input.refDocType,
      refDocId: input.refDocId,
      departmentId: null,
      recalcAverage: true,
    });
  }

  async getBalance(itemId: string, storeId: string) {
    return this.stockBalanceRepository.findByItemStore(itemId, storeId);
  }

  async listBalancesByStore(storeId: string) {
    return this.stockBalanceRepository.listByStore(storeId);
  }

  async listMovements(itemId: string, storeId: string) {
    return this.movementRepository.listForItemStore(itemId, storeId);
  }

  // ---- shared internals --------------------------------------------------

  private async recordOutbound(
    em: EntityManager,
    input: RecordIssueInput | RecordTransferOutInput,
    movementType: InvMovementType,
  ): Promise<InvMovementEntity> {
    this.assertPositiveQty(input.qty, `record${movementType}`);
    const existing = await this.findExistingByRefDoc(em, input.refDocType, input.refDocId, movementType);
    if (existing) return existing;

    const item = await this.itemRepository.findByIdOrFail(input.itemId, em);
    const departmentId = "departmentId" in input ? (input.departmentId ?? null) : null;

    return this.applyMovement(em, {
      itemId: input.itemId,
      storeId: input.storeId,
      movementType,
      signedQty: qtyNegate(input.qty),
      unitCost: item.avgCost,
      refDocType: input.refDocType,
      refDocId: input.refDocId,
      departmentId,
      recalcAverage: false,
    });
  }

  private async applyMovement(em: EntityManager, args: ApplyMovementArgs): Promise<InvMovementEntity> {
    if (qtyIsZero(args.signedQty)) {
      throw new ValidationException(
        `StockMovementsService.${args.movementType}: movement qty must be nonzero (item ${args.itemId}, store ${args.storeId})`,
      );
    }
    await this.assertNotFrozen(em, args.itemId, args.storeId, args.excludeStockTakeId);

    let balance = await this.stockBalanceRepository.findByIdForUpdate(em, args.itemId, args.storeId);
    const priorQty = balance?.qty ?? "0.0000";
    const priorValue = balance?.value ?? Money.ZERO;

    const newQty = qtyAdd(priorQty, args.signedQty);
    if (qtyIsNegative(newQty)) {
      throw new ValidationException(
        `BR-INV-01: insufficient stock — item ${args.itemId} at store ${args.storeId} has ${priorQty} on hand, ` +
          `this ${args.movementType} of ${args.signedQty} would take it to ${newQty}`,
      );
    }

    const movementValue = qtyTimesCostToMoney(args.signedQty, args.unitCost);
    const newValue = priorValue.add(movementValue);

    if (!balance) {
      balance = await this.stockBalanceRepository.create(
        { itemId: args.itemId, storeId: args.storeId, qty: newQty, value: newValue },
        em,
      );
    } else {
      balance.qty = newQty;
      balance.value = newValue;
      await this.stockBalanceRepository.save(balance, em);
    }

    if (args.recalcAverage) {
      const item = await this.itemRepository.findByIdOrFail(args.itemId, em);
      item.avgCost = computeWeightedAverageCost(priorQty, priorValue, args.signedQty, movementValue);
      await this.itemRepository.save(item, em);
    }

    return this.movementRepository.create(
      {
        itemId: args.itemId,
        storeId: args.storeId,
        movementType: args.movementType,
        qty: args.signedQty,
        unitCost: args.unitCost,
        value: movementValue,
        refDocType: args.refDocType,
        refDocId: args.refDocId,
        departmentId: args.departmentId ?? null,
        journalId: null,
        at: new Date(),
      },
      em,
    );
  }

  /** See class doc comment "Idempotency, honestly". */
  private async findExistingByRefDoc(
    em: EntityManager,
    refDocType: string,
    refDocId: string,
    movementType: InvMovementType,
  ): Promise<InvMovementEntity | null> {
    const rows = await this.movementRepository.listByRefDoc(refDocType, refDocId, em);
    return rows.find((row) => row.movementType === movementType) ?? null;
  }

  /** BR-INV-03 — see class doc comment. */
  private async assertNotFrozen(
    em: EntityManager,
    itemId: string,
    storeId: string,
    excludeStockTakeId?: string,
  ): Promise<void> {
    const candidates = await this.stockTakeRepository.listOpenForStore(storeId, em);
    for (const take of candidates) {
      if (excludeStockTakeId && take.id === excludeStockTakeId) continue;
      if (!FROZEN_STOCK_TAKE_STATUSES.includes(take.status)) continue;
      if (isItemInScope(take.scope, itemId)) {
        throw new ValidationException(
          `BR-INV-03: stock take ${take.number} (status=${take.status}) is in progress for item ${itemId} at store ${storeId} — movements are blocked until it resolves`,
        );
      }
    }
  }

  private assertPositiveQty(qty: string, action: string): void {
    if (!qtyIsPositive(qty)) {
      throw new ValidationException(`StockMovementsService.${action}: qty must be positive`);
    }
  }
}

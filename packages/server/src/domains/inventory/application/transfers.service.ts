import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { NumberingService } from "../../../platform/settings";
import { InvTransferEntity } from "../domain/inv-transfer.entity";
import { InvTransferLineEntity } from "../domain/inv-transfer-line.entity";
import { InvTransferRepository } from "../infrastructure/inv-transfer.repository";
import { InvTransferLineRepository } from "../infrastructure/inv-transfer-line.repository";
import { StockMovementsService } from "./stock-movements.service";
import { qtyIsPositive } from "./decimal-qty.util";

const TRANSFER_LINE_REF_DOC_TYPE = "inv_transfer_line";
const TRANSFER_LINE_CANCEL_REF_DOC_TYPE = "inv_transfer_line_cancel";

export interface TransferLineInput {
  itemId: string;
  /** Positive decimal string, scale <=4. */
  qty: string;
  /** Decimal string, scale <=6 — the cost basis this line moves stock at. */
  unitCost: string;
}

export interface IssueTransferInput {
  fromStoreId: string;
  toStoreId: string;
  lines: TransferLineInput[];
}

/**
 * `inv_transfer` (+`inv_transfer_line`) two-step (issue -> receive)
 * inter-store transfer (FR-INV-003.1). Composes `StockMovementsService`'s
 * `recordTransferOut()`/`recordTransferIn()`/`recordAdjustment()` primitives
 * rather than re-implementing the balance-lock/weighted-average logic — the
 * task brief's own explicit instruction ("avoid duplicating the
 * weighted-average/lock logic").
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly transferRepository: InvTransferRepository,
    private readonly transferLineRepository: InvTransferLineRepository,
    private readonly stockMovementsService: StockMovementsService,
    private readonly numberingService: NumberingService,
  ) {}

  /**
   * Creates the `inv_transfer` header (`status='ISSUED'`) + its lines
   * atomically, then records a `TRANSFER_OUT` movement per line at the
   * SOURCE store (`fromStoreId`) — `inv_transfer` has no `DRAFT` status
   * (its lifecycle starts directly at `ISSUED`, per `InvTransferLineEntity`'s
   * own doc comment), so stock leaves the source store the instant this
   * method returns.
   */
  async issue(em: EntityManager, input: IssueTransferInput, issuedBy: string): Promise<InvTransferEntity> {
    if (input.fromStoreId === input.toStoreId) {
      throw new ValidationException("TransfersService.issue: fromStoreId and toStoreId must differ");
    }
    if (input.lines.length === 0) {
      throw new ValidationException("TransfersService.issue: a transfer needs at least one line");
    }
    for (const line of input.lines) {
      if (!qtyIsPositive(line.qty)) {
        throw new ValidationException(`TransfersService.issue: line for item ${line.itemId} must have qty > 0`);
      }
    }

    const number = await this.numberingService.allocate(em, "INV_TRANSFER");
    const transfer = await this.transferRepository.create(
      {
        number,
        fromStoreId: input.fromStoreId,
        toStoreId: input.toStoreId,
        status: "ISSUED",
        issuedBy,
        receivedBy: null,
        createdBy: issuedBy,
        updatedBy: issuedBy,
      },
      em,
    );

    let lineNo = 1;
    for (const lineInput of input.lines) {
      const line = await this.transferLineRepository.create(
        {
          transferId: transfer.id,
          lineNo: lineNo++,
          itemId: lineInput.itemId,
          qty: lineInput.qty,
          unitCost: lineInput.unitCost,
          createdBy: issuedBy,
          updatedBy: issuedBy,
        },
        em,
      );

      await this.stockMovementsService.recordTransferOut(em, {
        itemId: line.itemId,
        storeId: transfer.fromStoreId,
        qty: line.qty,
        refDocType: TRANSFER_LINE_REF_DOC_TYPE,
        refDocId: line.id,
      });
    }

    return transfer;
  }

  /**
   * `ISSUED`/`IN_TRANSIT` -> `RECEIVED`. Records a `TRANSFER_IN` movement per
   * line at the DESTINATION store, valued at the ORIGINAL `unit_cost`
   * captured on the `inv_transfer_line` at issue time — which then feeds
   * into the destination store's own weighted-average recalculation
   * (`StockMovementsService.recordTransferIn()`'s `recalcAverage: true`).
   */
  async receive(em: EntityManager, transferId: string, receivedBy: string): Promise<InvTransferEntity> {
    const transfer = await this.transferRepository.findByIdOrFail(transferId, em);
    if (!["ISSUED", "IN_TRANSIT"].includes(transfer.status)) {
      throw new ValidationException(
        `TransfersService.receive: transfer ${transferId} must be ISSUED/IN_TRANSIT to receive (status=${transfer.status})`,
      );
    }

    const lines = await this.transferLineRepository.findByTransferId(transferId, em);
    for (const line of lines) {
      await this.stockMovementsService.recordTransferIn(em, {
        itemId: line.itemId,
        storeId: transfer.toStoreId,
        qty: line.qty,
        unitCost: line.unitCost,
        refDocType: TRANSFER_LINE_REF_DOC_TYPE,
        refDocId: line.id,
      });
    }

    transfer.status = "RECEIVED";
    transfer.receivedBy = receivedBy;
    transfer.updatedBy = receivedBy;
    return this.transferRepository.save(transfer, em);
  }

  /**
   * Only from `ISSUED`/`IN_TRANSIT` — both statuses imply `issue()` already
   * deducted the source store's balance, so cancellation always reverses it.
   * No dedicated "transfer cancellation" `inv_movement.movement_type` exists
   * in the seven-value enum (`INV_MOVEMENT_TYPES`), so the reversal is
   * recorded as an `ADJUSTMENT` gain at the source store (signed `+qty`, the
   * line's own `unit_cost`) — a documented judgement call, the same
   * "no dedicated type, reuse ADJUSTMENT" shape a reversal-without-its-own-
   * enum-value naturally takes in this codebase.
   */
  async cancel(em: EntityManager, transferId: string, actorId: string | null = null): Promise<InvTransferEntity> {
    const transfer = await this.transferRepository.findByIdOrFail(transferId, em);
    if (!["ISSUED", "IN_TRANSIT"].includes(transfer.status)) {
      throw new ValidationException(
        `TransfersService.cancel: transfer ${transferId} can only be cancelled from ISSUED/IN_TRANSIT (status=${transfer.status})`,
      );
    }

    const lines = await this.transferLineRepository.findByTransferId(transferId, em);
    for (const line of lines) {
      await this.stockMovementsService.recordAdjustment(em, {
        itemId: line.itemId,
        storeId: transfer.fromStoreId,
        qtyDelta: line.qty,
        unitCost: line.unitCost,
        refDocType: TRANSFER_LINE_CANCEL_REF_DOC_TYPE,
        refDocId: line.id,
      });
    }

    transfer.status = "CANCELLED";
    transfer.updatedBy = actorId;
    return this.transferRepository.save(transfer, em);
  }

  async findByIdOrFail(id: string): Promise<InvTransferEntity> {
    return this.transferRepository.findByIdOrFail(id);
  }

  async listLines(transferId: string): Promise<InvTransferLineEntity[]> {
    return this.transferLineRepository.findByTransferId(transferId);
  }

  async list(filter: Parameters<InvTransferRepository["list"]>[0] = {}): Promise<InvTransferEntity[]> {
    return this.transferRepository.list(filter);
  }
}

import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";
import { GlAccountRepository, PostingService, PostJournalLineDraft } from "../../../accounting";
import { NumberingService, SettingsService } from "../../../platform/settings";
import { ProcGrnEntity } from "../domain/proc-grn.entity";
import { ProcGrnLineEntity } from "../domain/proc-grn-line.entity";
import { ProcGrnLineRepository } from "../infrastructure/proc-grn-line.repository";
import { ProcGrnRepository } from "../infrastructure/proc-grn.repository";
import { ProcPoLineRepository } from "../infrastructure/proc-po-line.repository";
import { ProcPurchaseOrderRepository } from "../infrastructure/proc-purchase-order.repository";
import {
  resolveGrnAccrualAccount,
  resolveInventoryControlAccount,
  resolveProcurementExpenseAccount,
} from "./gl-grn-accounts.util";
import { PurchaseOrdersService } from "./purchase-orders.service";

/** Settings key GRN receiving reads for the configurable tolerance — FR-PROC-006.1. */
export const GRN_QTY_TOLERANCE_SETTING_KEY = "procurement.grn_qty_tolerance_percent";
/** Default when the Settings row hasn't been configured — matches the DB trigger's own hard ceiling. */
const DEFAULT_GRN_QTY_TOLERANCE_PERCENT = 5;
/** `trg_proc_grn_qty_cap`'s (migration `0100`) own hard, non-configurable ceiling — the service-layer configured tolerance is clamped to this, so Settings can only ever TIGHTEN, never loosen, the DB backstop. */
const HARD_DB_TOLERANCE_PERCENT = 5;

export interface ReceiveGrnLineInput {
  poLineId: string;
  receivedQty: string;
  rejectedQty?: string;
  rejectionReason?: string | null;
  unitCost: Money;
}

export interface ReceiveGrnInput {
  poId: string;
  receivedBy: string;
  lines: ReceiveGrnLineInput[];
  notes?: string | null;
}

/**
 * `proc_grn` (+`proc_grn_line`) receiving and posting.
 *
 * **`receive()`** — BR-PROC-01 (no GRN without an ISSUED+ PO). Creates the
 * GRN `status='DRAFT'` — per `ProcGrnEntity`'s OWN doc comment ("a GRN
 * genuinely starts DRAFT with no journal yet ... allowing a receiving clerk
 * to capture quantities before the accounting posting step runs"), not
 * straight to a posted/processing state. Enforces BR-PROC-03's real
 * *configurable* tolerance (Settings key `procurement.grn_qty_tolerance_percent`,
 * default 5%, clamped to never exceed the DB trigger's own hard 5% ceiling)
 * in addition to — never instead of — `trg_proc_grn_qty_cap` (migration
 * `0100`), which remains the non-configurable backstop this service can
 * never loosen past. Increments each `proc_po_line.received_qty` by the
 * line's gross `received_qty` (matching exactly what `trg_proc_grn_qty_cap`
 * itself sums — rejections are tracked separately via `rejected_qty` and do
 * NOT reduce this running total), then calls
 * `PurchaseOrdersService.updateReceivingStatus()` to roll the parent PO's
 * status up.
 *
 * **Rejected quantities** (FR-PROC-006.1: "rejects captured with reason ->
 * Return-to-Supplier note") — this pass only records `rejected_qty`/
 * `rejection_reason` on `proc_grn_line`. A full Return-to-Supplier DOCUMENT
 * is explicitly out of scope: no such table exists in the 13-table DDL the
 * foundation pass built (confirmed against `docs/phase-4/04-schema-operations.md`
 * §2 and the foundation pass's own PROGRESS.md entry) — Pass B or a later
 * module would need to introduce one.
 *
 * **`post(em, grnId, postedBy)`** — the P-18/P-19 posting-map algorithm
 * (`docs/phase-2/01-functional-requirements.md`, this pass's task brief):
 * for each `proc_grn_line`, `acceptedQty = received_qty - rejected_qty`
 * (only the physically-accepted quantity carries GL value — a fully
 * rejected line contributes nothing); `lineValue = acceptedQty * unit_cost`.
 * If the underlying `proc_po_line.item_id` is set -> **P-18**, debit the
 * `INVENTORY` control account; if NULL (today's only reachable case, since
 * Module 13/Inventory doesn't exist yet and never populates `item_id`) ->
 * **P-19**, debit the documented "Procurement Expense / Asset WIP" account
 * (see `gl-grn-accounts.util.ts` for the full account-resolution writeup,
 * including why `proc_requisition_line.budget_line_id` could NOT be reached
 * from a GRN line). Every accepted line becomes its own debit journal line
 * (full `entityRefType='proc_grn_line'` traceability); the credit side —
 * the SAME "GRN Accrual" liability account for both P-18 and P-19, per the
 * task's own posting-map table — is aggregated into ONE journal line for
 * the GRN's total accepted value, mirroring `InvoicingService.postInvoice()`'s
 * "one aggregate credit line" precedent. `ONE` `PostingService.post()` call
 * realizes the whole GRN. `NumberingService.allocate(em, 'PROC_GRN')`
 * resolves the real `number` at this point (the GRN started with a
 * `DRAFT-<uuid>` placeholder at `receive()` time).
 */
@Injectable()
export class GrnService {
  constructor(
    private readonly grnRepository: ProcGrnRepository,
    private readonly grnLineRepository: ProcGrnLineRepository,
    private readonly poLineRepository: ProcPoLineRepository,
    private readonly poRepository: ProcPurchaseOrderRepository,
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly glAccountRepository: GlAccountRepository,
    private readonly postingService: PostingService,
    private readonly numberingService: NumberingService,
    private readonly settingsService: SettingsService,
  ) {}

  async receive(em: EntityManager, input: ReceiveGrnInput): Promise<ProcGrnEntity> {
    if (input.lines.length === 0) {
      throw new ValidationException("A GRN needs at least one line");
    }
    const po = await this.poRepository.findByIdOrFail(input.poId, em);
    if (!["ISSUED", "PARTIALLY_RECEIVED"].includes(po.status)) {
      throw new ValidationException(`BR-PROC-01: no GRN without an ISSUED+ PO (po ${input.poId} status=${po.status})`);
    }

    const configuredTolerance = await this.settingsService.getTyped<number>(
      GRN_QTY_TOLERANCE_SETTING_KEY,
      DEFAULT_GRN_QTY_TOLERANCE_PERCENT,
    );
    const tolerancePercent = Math.min(configuredTolerance, HARD_DB_TOLERANCE_PERCENT);

    const grnId = generateUuidV7();
    const grn = await this.grnRepository.create(
      {
        id: grnId,
        // `number varchar(30)` (migration 0100) can't hold "DRAFT-" (6) + a full UUID (36) = 42
        // chars — truncate the hyphen-stripped UUID to fit.
        number: `DRAFT-${grnId.replace(/-/g, "").slice(0, 24)}`,
        poId: input.poId,
        receivedBy: input.receivedBy,
        receivedAt: new Date(),
        status: "DRAFT",
        journalId: null,
        notes: input.notes ?? null,
        createdBy: input.receivedBy,
        updatedBy: input.receivedBy,
      },
      em,
    );

    for (const lineInput of input.lines) {
      const poLine = await this.poLineRepository.findByIdOrFail(lineInput.poLineId, em);
      if (poLine.poId !== input.poId) {
        throw new ValidationException(`PO line ${lineInput.poLineId} does not belong to PO ${input.poId}`);
      }
      const receivedQty = Money.fromDecimalString(lineInput.receivedQty);
      if (!receivedQty.isPositive()) {
        throw new ValidationException(`GRN line for PO line ${lineInput.poLineId} must have received_qty > 0`);
      }

      const priorLines = await this.grnLineRepository.findByPoLineId(lineInput.poLineId, em);
      const priorReceived = priorLines.reduce((sum, l) => sum.add(Money.fromDecimalString(l.receivedQty)), Money.ZERO);
      const poLineQty = Money.fromDecimalString(poLine.qty);
      const ceiling = poLineQty.multiply((1 + tolerancePercent / 100).toString());
      const projected = priorReceived.add(receivedQty);
      if (projected.compare(ceiling) > 0) {
        throw new ValidationException(
          `BR-PROC-03: PO line ${lineInput.poLineId} received_qty would total ${projected.toDecimalString()}, exceeding its qty ${poLine.qty} + ${tolerancePercent}% tolerance (ceiling ${ceiling.toDecimalString()}) — trg_proc_grn_qty_cap remains the DB-layer hard backstop at ${HARD_DB_TOLERANCE_PERCENT}%`,
        );
      }

      await this.grnLineRepository.create(
        {
          grnId: grn.id,
          poLineId: poLine.id,
          receivedQty: lineInput.receivedQty,
          rejectedQty: lineInput.rejectedQty ?? "0",
          rejectionReason: lineInput.rejectionReason ?? null,
          unitCost: lineInput.unitCost,
          createdBy: input.receivedBy,
          updatedBy: input.receivedBy,
        },
        em,
      );

      poLine.receivedQty = priorReceived.add(receivedQty).toDecimalString();
      poLine.updatedBy = input.receivedBy;
      await this.poLineRepository.save(poLine, em);
    }

    await this.purchaseOrdersService.updateReceivingStatus(em, input.poId);

    return grn;
  }

  /** See class doc comment "post()". */
  async post(em: EntityManager, grnId: string, postedBy: string): Promise<ProcGrnEntity> {
    const grn = await this.grnRepository.findByIdOrFail(grnId, em);
    if (grn.status !== "DRAFT") {
      throw new ValidationException(`Only a DRAFT GRN can be posted (grn ${grnId} status=${grn.status})`);
    }
    const lines = await this.grnLineRepository.findByGrnId(grnId, em);
    if (lines.length === 0) {
      throw new ValidationException(`GRN ${grnId} has no lines — nothing to post`);
    }

    const journalLines: PostJournalLineDraft[] = [];
    let totalAccrual = Money.ZERO;

    for (const line of lines) {
      const acceptedQty = Money.fromDecimalString(line.receivedQty).subtract(Money.fromDecimalString(line.rejectedQty));
      if (!acceptedQty.isPositive()) continue; // fully rejected — nothing accepted, no GL impact

      const lineValue = line.unitCost.multiply(acceptedQty.toDecimalString());
      if (!lineValue.isPositive()) continue;

      const poLine = await this.poLineRepository.findByIdOrFail(line.poLineId, em);
      const isStockItem = poLine.itemId !== null;
      const debitAccount = isStockItem
        ? await resolveInventoryControlAccount(this.glAccountRepository, em) // P-18 — currently unreachable, see gl-grn-accounts.util.ts
        : await resolveProcurementExpenseAccount(this.glAccountRepository, em); // P-19 — today's only reachable branch

      journalLines.push({
        accountId: debitAccount.id,
        debit: lineValue,
        credit: Money.ZERO,
        memo: `${isStockItem ? "P-18" : "P-19"} GRN line ${line.id}`,
        entityRefType: "proc_grn_line",
        entityRefId: line.id,
      });
      totalAccrual = totalAccrual.add(lineValue);
    }

    if (!totalAccrual.isPositive()) {
      throw new ValidationException(`GRN ${grnId} has zero accepted value (every line fully rejected) — nothing to post`);
    }

    const grnAccrualAccount = await resolveGrnAccrualAccount(this.glAccountRepository, em);
    journalLines.push({
      accountId: grnAccrualAccount.id,
      debit: Money.ZERO,
      credit: totalAccrual,
      memo: "P-18/P-19 GRN accrual",
      entityRefType: "proc_grn",
      entityRefId: grn.id,
    });

    const po = await this.poRepository.findByIdOrFail(grn.poId, em);
    const journal = await this.postingService.post(em, {
      journalDate: grn.receivedAt.toISOString().slice(0, 10),
      sourceModule: "procurement",
      sourceDocType: "proc_grn",
      sourceDocId: grn.id,
      narration: `GRN posted for PO ${po.number}`,
      journalType: "MANUAL",
      postedBy,
      lines: journalLines,
    });

    const number = await this.numberingService.allocate(em, "PROC_GRN");
    grn.number = number;
    grn.status = "POSTED";
    grn.journalId = journal.id;
    grn.updatedBy = postedBy;
    return this.grnRepository.save(grn, em);
  }

  async findByIdOrFail(id: string): Promise<ProcGrnEntity> {
    return this.grnRepository.findByIdOrFail(id);
  }

  async listByPo(poId: string): Promise<ProcGrnEntity[]> {
    return this.grnRepository.findByPoId(poId);
  }

  async listLines(grnId: string): Promise<ProcGrnLineEntity[]> {
    return this.grnLineRepository.findByGrnId(grnId);
  }
}

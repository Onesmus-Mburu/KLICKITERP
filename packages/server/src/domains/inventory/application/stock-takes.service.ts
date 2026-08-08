import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { GlAccountRepository, PostingService, PostJournalLineDraft } from "../../../accounting";
import { ApprovalEngineService } from "../../../platform/approvals";
import { NumberingService } from "../../../platform/settings";
import { InvItemRepository } from "../infrastructure/inv-item.repository";
import { InvStockBalanceRepository } from "../infrastructure/inv-stock-balance.repository";
import { InvStockTakeRepository } from "../infrastructure/inv-stock-take.repository";
import { InvStockTakeLineRepository } from "../infrastructure/inv-stock-take-line.repository";
import { InvStockTakeEntity } from "../domain/inv-stock-take.entity";
import { InvStockTakeLineEntity } from "../domain/inv-stock-take-line.entity";
import { InvStockTakeScope } from "./stock-take-scope.util";
import { StockMovementsService } from "./stock-movements.service";
import { resolveInventoryControlAccount, resolveStockLossExpenseAccount } from "./gl-inventory-accounts.util";
import { moneyDividedByQtyToCost, qtyIsZero, qtyTimesCostToMoney } from "./decimal-qty.util";

/** `appr_workflow_def.domain_code` this module submits stock-take adjustments under — the `0900` seed extension must register a workflow def/version under this code (`seedSingleLevelWorkflow()`) before `submitForApproval()` can succeed, the same bootstrapping-gap pattern every other domain module hits (see `RequisitionsService`'s own doc comment). */
export const STOCK_ADJUSTMENTS_APPROVAL_DOMAIN_CODE = "STOCK_ADJUSTMENTS";

const STOCK_TAKE_LINE_REF_DOC_TYPE = "inv_stock_take_line";

export interface CreateStockTakeSessionInput {
  storeId: string;
  scope: InvStockTakeScope;
}

export interface RecordStockTakeCountInput {
  lineId: string;
  /** Decimal string, scale <=4. */
  countedQty: string;
}

/**
 * `inv_stock_take` (+`inv_stock_take_line`) physical count session
 * (FR-INV-009.1: create session -> freeze snapshot -> count entry -> variance
 * report -> `STOCK_ADJUSTMENTS` approval -> post, BR-INV-03).
 */
@Injectable()
export class StockTakesService {
  constructor(
    private readonly stockTakeRepository: InvStockTakeRepository,
    private readonly stockTakeLineRepository: InvStockTakeLineRepository,
    private readonly stockBalanceRepository: InvStockBalanceRepository,
    private readonly itemRepository: InvItemRepository,
    private readonly stockMovementsService: StockMovementsService,
    private readonly approvalEngine: ApprovalEngineService,
    private readonly postingService: PostingService,
    private readonly glAccountRepository: GlAccountRepository,
    private readonly numberingService: NumberingService,
  ) {}

  /**
   * `status='OPEN'`, `snapshot_at=now()` — THE freeze point: from this
   * moment, `StockMovementsService`'s BR-INV-03 check blocks further
   * movements on every item this session's `scope` covers at this store
   * until the session resolves (`POSTED`/`CANCELLED`). One
   * `inv_stock_take_line` per item in scope, `snapshot_qty` = that item's
   * CURRENT `inv_stock_balance.qty` at this store (0 if no balance row
   * exists yet — a legitimate "confirm it's genuinely zero" count target).
   * `scope.itemIds === "ALL"` resolves to every item that currently HAS an
   * `inv_stock_balance` row at this store (see `stock-take-scope.util.ts`'s
   * doc comment for the full scope-shape design decision) — a store with no
   * tracked balances yet has nothing to count and is rejected.
   */
  async createSession(em: EntityManager, input: CreateStockTakeSessionInput, initiatedBy: string): Promise<InvStockTakeEntity> {
    let itemIds: string[];
    if (input.scope.itemIds === "ALL") {
      const balances = await this.stockBalanceRepository.listByStore(input.storeId, em);
      itemIds = balances.map((b) => b.itemId);
      if (itemIds.length === 0) {
        throw new ValidationException(
          `StockTakesService.createSession: store ${input.storeId} has no inv_stock_balance rows to count (scope.itemIds='ALL')`,
        );
      }
    } else {
      if (input.scope.itemIds.length === 0) {
        throw new ValidationException("StockTakesService.createSession: scope.itemIds must be non-empty (or 'ALL')");
      }
      itemIds = [...new Set(input.scope.itemIds)];
    }

    const number = await this.numberingService.allocate(em, "INV_STOCK_TAKE");
    const stockTake = await this.stockTakeRepository.create(
      {
        number,
        storeId: input.storeId,
        scope: input.scope as unknown as Record<string, unknown>,
        snapshotAt: new Date(),
        status: "OPEN",
        approvalRef: null,
        journalId: null,
        createdBy: initiatedBy,
        updatedBy: initiatedBy,
      },
      em,
    );

    for (const itemId of itemIds) {
      const balance = await this.stockBalanceRepository.findByItemStore(itemId, input.storeId, em);
      await this.stockTakeLineRepository.create(
        {
          stockTakeId: stockTake.id,
          itemId,
          snapshotQty: balance?.qty ?? "0.0000",
          countedQty: null,
          varianceValue: null,
          createdBy: initiatedBy,
          updatedBy: initiatedBy,
        },
        em,
      );
    }

    return stockTake;
  }

  /**
   * Fills in `counted_qty` for the given lines (the DB's generated
   * `variance_qty` column then reflects the delta automatically).
   * `status` -> `COUNTING` on the first count, `REVIEW` once EVERY line in
   * the session has a non-null `counted_qty`.
   */
  async recordCounts(
    em: EntityManager,
    stockTakeId: string,
    counts: RecordStockTakeCountInput[],
    actorId: string | null = null,
  ): Promise<InvStockTakeEntity> {
    const stockTake = await this.stockTakeRepository.findByIdOrFail(stockTakeId, em);
    if (!["OPEN", "COUNTING"].includes(stockTake.status)) {
      throw new ValidationException(
        `StockTakesService.recordCounts: counts can only be recorded while OPEN/COUNTING (stock take ${stockTakeId} status=${stockTake.status})`,
      );
    }
    if (counts.length === 0) {
      throw new ValidationException("StockTakesService.recordCounts: counts must be non-empty");
    }

    for (const count of counts) {
      const line = await this.stockTakeLineRepository.findByIdOrFail(count.lineId, em);
      if (line.stockTakeId !== stockTakeId) {
        throw new ValidationException(`Line ${count.lineId} does not belong to stock take ${stockTakeId}`);
      }
      line.countedQty = count.countedQty;
      line.updatedBy = actorId;
      await this.stockTakeLineRepository.save(line, em);
    }

    const allLines = await this.stockTakeLineRepository.findByStockTakeId(stockTakeId, em);
    const allCounted = allLines.every((line) => line.countedQty !== null);
    stockTake.status = allCounted ? "REVIEW" : "COUNTING";
    stockTake.updatedBy = actorId;
    return this.stockTakeRepository.save(stockTake, em);
  }

  /**
   * Computes `variance_value = variance_qty * unit_cost` per line — the
   * per-line unit cost is the item's `avg_cost` **AT THIS "review" MOMENT**
   * (documented judgement call, task brief's own suggestion: "use the item's
   * current avg_cost at review time"), persisted onto `variance_value`
   * immediately so `post()` later reuses this EXACT frozen figure (via
   * `moneyDividedByQtyToCost()`) rather than re-deriving a possibly-drifted
   * `avg_cost` — `avg_cost` could legitimately move between `REVIEW` and
   * `POSTED` if OTHER stores' receipts for the same item land in between
   * (BR-INV-03's freeze is per-store/per-scope, not global). Sums the
   * ABSOLUTE value of every line's variance into `totalVarianceValueAbs`,
   * submitted as the `STOCK_ADJUSTMENTS` approval instance's `amount`.
   */
  async submitForApproval(em: EntityManager, stockTakeId: string, initiatorId: string): Promise<InvStockTakeEntity> {
    const stockTake = await this.stockTakeRepository.findByIdOrFail(stockTakeId, em);
    if (stockTake.status !== "REVIEW") {
      throw new ValidationException(
        `StockTakesService.submitForApproval: only a REVIEW stock take can be submitted (stock take ${stockTakeId} status=${stockTake.status})`,
      );
    }

    const lines = await this.stockTakeLineRepository.findByStockTakeId(stockTakeId, em);
    if (lines.length === 0) {
      throw new ValidationException(`Stock take ${stockTakeId} has no lines — nothing to submit`);
    }

    let totalVarianceValueAbs = Money.ZERO;
    for (const line of lines) {
      const varianceQty = line.varianceQty ?? "0.0000";
      const item = await this.itemRepository.findByIdOrFail(line.itemId, em);
      const varianceValue = qtyTimesCostToMoney(varianceQty, item.avgCost);
      line.varianceValue = varianceValue;
      line.updatedBy = initiatorId;
      await this.stockTakeLineRepository.save(line, em);
      totalVarianceValueAbs = totalVarianceValueAbs.add(varianceValue.isNegative() ? varianceValue.negate() : varianceValue);
    }

    const instance = await this.approvalEngine.submit(em, {
      domainCode: STOCK_ADJUSTMENTS_APPROVAL_DOMAIN_CODE,
      entityType: "inv_stock_take",
      entityId: stockTake.id,
      amount: totalVarianceValueAbs,
      initiatorId,
    });

    stockTake.status = "PENDING_APPROVAL";
    stockTake.approvalRef = instance.id;
    stockTake.updatedBy = initiatorId;
    return this.stockTakeRepository.save(stockTake, em);
  }

  /**
   * Interim manual-trigger pattern — same shape every other module's
   * `onApprovalDecided()` uses (`RequisitionsService`/`PurchaseOrdersService`/
   * `PaymentVouchersService`, none of which take an `EntityManager` either —
   * followed here for consistency over the task brief's own loosely-worded
   * `onApprovalDecided(em, ...)` signature sketch, since a plain status flip
   * needs no caller-shared transaction).
   *
   * **No `APPROVED` status exists on `inv_stock_take`** — a deliberate
   * divergence from every other module's `onApprovalDecided()`, forced by
   * the foundation pass's own schema (`INV_STOCK_TAKE_STATUSES` is exactly
   * `OPEN|COUNTING|REVIEW|PENDING_APPROVAL|POSTED|CANCELLED` — six values,
   * no seventh "APPROVED" — see `InvStockTakeEntity`'s own doc comment; this
   * pass does not redefine the foundation schema to add one). So: on
   * REJECT/RETURN, `status` moves back to `REVIEW` (a real, useful
   * transition — "sent back for recount/resubmission"). On APPROVE, `status`
   * deliberately stays `PENDING_APPROVAL` — there is nowhere else in the
   * enum for it to go — and readiness-to-post is instead verified by
   * `post()` querying `ApprovalEngineService.getStatus()` directly for the
   * underlying `appr_instance`'s OWN `status` column (which DOES have a real
   * `APPROVED` value). This is exactly FR-APPR-007.1's own textbook idiom
   * ("domains verify `approval_ref` before posting") applied literally
   * rather than mirrored into a second, schema-incompatible copy.
   */
  async onApprovalDecided(stockTakeId: string, approved: boolean, actorId: string | null = null): Promise<InvStockTakeEntity> {
    const stockTake = await this.stockTakeRepository.findByIdOrFail(stockTakeId);
    if (stockTake.status !== "PENDING_APPROVAL") {
      throw new ValidationException(
        `inv_stock_take ${stockTakeId} is not PENDING_APPROVAL (status=${stockTake.status})`,
      );
    }
    if (approved) {
      return stockTake; // see doc comment — no persisted status change; post() verifies via ApprovalEngineService directly.
    }
    stockTake.status = "REVIEW";
    stockTake.updatedBy = actorId;
    return this.stockTakeRepository.save(stockTake);
  }

  /**
   * Requires `status='PENDING_APPROVAL'` AND a genuinely `APPROVED`
   * `STOCK_ADJUSTMENTS` `appr_instance` attached via `approval_ref` (see
   * `onApprovalDecided()`'s doc comment for why readiness is verified this
   * way rather than via `inv_stock_take.status` itself). For each line with
   * nonzero `variance_qty`, calls
   * `StockMovementsService.recordAdjustment()` — the resulting `inv_movement`
   * uses `moneyDividedByQtyToCost(line.varianceValue, line.varianceQty)` to
   * recover the EXACT per-unit cost that reproduces `variance_value` (frozen
   * at `submitForApproval()`/"review" time), so the physical adjustment and
   * the GL posting below always agree.
   *
   * **P-24 net-figure aggregation** (task brief's own explicit judgement
   * call: "aggregate to one net figure if that's cleaner and still correct —
   * your call, document it"): rather than one GL line per item, every
   * variance line's ALREADY-SIGNED `variance_value` (positive=gain,
   * negative=loss) is summed into ONE `netVarianceValue`, and exactly ONE
   * pair of journal lines realizes P-24 for the whole session — netting a
   * gain on one item against a loss on another INTO one figure, rather than
   * booking both gross. Chosen for the same "aggregate into one clean
   * journal per document" shape `InvoicingService.postInvoice()`/
   * `GrnService.post()` already established for THIS module's own posting
   * style, and because BR-INV-03's freeze already guarantees no other
   * movement touched these specific items between snapshot and posting, so
   * netting introduces no hidden double-counting risk. If `netVarianceValue`
   * is negative (net loss): debit `Stock Loss Expense` (`5070`), credit
   * `INVENTORY`. If positive (net gain): the exact reverse, per the task's
   * own posting-map table ("gain equivalent: reverse the debit/credit for
   * positive variance"). If exactly zero (including the "no lines had any
   * variance at all" case, or lines happened to net to zero), no journal is
   * posted at all — `journal_id` stays `null`, a legitimate "count confirmed
   * the books were right" / "gains and losses happened to offset exactly"
   * outcome with nothing to book.
   */
  async post(em: EntityManager, stockTakeId: string, postedBy: string): Promise<InvStockTakeEntity> {
    const stockTake = await this.stockTakeRepository.findByIdOrFail(stockTakeId, em);
    if (stockTake.status !== "PENDING_APPROVAL") {
      throw new ValidationException(
        `StockTakesService.post: only a PENDING_APPROVAL stock take (with an APPROVED STOCK_ADJUSTMENTS instance) can be posted (stock take ${stockTakeId} status=${stockTake.status})`,
      );
    }
    if (!stockTake.approvalRef) {
      throw new ValidationException(`StockTakesService.post: stock take ${stockTakeId} has no approval_ref attached`);
    }
    const instance = await this.approvalEngine.getStatus("inv_stock_take", stockTakeId);
    if (!instance || instance.status !== "APPROVED") {
      throw new ValidationException(
        `StockTakesService.post: stock take ${stockTakeId}'s STOCK_ADJUSTMENTS approval instance is not APPROVED (current: ${instance?.status ?? "none"})`,
      );
    }

    const lines = await this.stockTakeLineRepository.findByStockTakeId(stockTakeId, em);
    const varianceLines = lines.filter((line) => line.varianceQty !== null && !qtyIsZero(line.varianceQty));

    let netVarianceValue = Money.ZERO;
    for (const line of varianceLines) {
      const varianceValue = line.varianceValue ?? Money.ZERO;
      netVarianceValue = netVarianceValue.add(varianceValue);

      const unitCost = moneyDividedByQtyToCost(varianceValue, line.varianceQty!);
      await this.stockMovementsService.recordAdjustment(em, {
        itemId: line.itemId,
        storeId: stockTake.storeId,
        qtyDelta: line.varianceQty!,
        unitCost,
        refDocType: STOCK_TAKE_LINE_REF_DOC_TYPE,
        refDocId: line.id,
        // This stock take's own APPROVED-instance-verified freeze must not block realizing its
        // OWN counted variance — see StockMovementsService's "post()-time freeze release" doc
        // comment.
        excludeStockTakeId: stockTake.id,
      });
    }

    let journalId: string | null = null;
    if (!netVarianceValue.isZero()) {
      const inventoryAccount = await resolveInventoryControlAccount(this.glAccountRepository, em);
      const lossAccount = await resolveStockLossExpenseAccount(this.glAccountRepository, em);
      const absValue = netVarianceValue.isNegative() ? netVarianceValue.negate() : netVarianceValue;
      const isLoss = netVarianceValue.isNegative();

      const journalLines: PostJournalLineDraft[] = isLoss
        ? [
            { accountId: lossAccount.id, debit: absValue, credit: Money.ZERO, memo: "P-24 net stock-take loss", entityRefType: "inv_stock_take", entityRefId: stockTake.id },
            { accountId: inventoryAccount.id, debit: Money.ZERO, credit: absValue, memo: "P-24 net stock-take loss", entityRefType: "inv_stock_take", entityRefId: stockTake.id },
          ]
        : [
            { accountId: inventoryAccount.id, debit: absValue, credit: Money.ZERO, memo: "P-24 net stock-take gain", entityRefType: "inv_stock_take", entityRefId: stockTake.id },
            { accountId: lossAccount.id, debit: Money.ZERO, credit: absValue, memo: "P-24 net stock-take gain", entityRefType: "inv_stock_take", entityRefId: stockTake.id },
          ];

      const journal = await this.postingService.post(em, {
        journalDate: new Date().toISOString().slice(0, 10),
        sourceModule: "inventory",
        sourceDocType: "inv_stock_take",
        sourceDocId: stockTake.id,
        narration: `Stock take ${stockTake.number} posted (P-24)`,
        journalType: "MANUAL",
        postedBy,
        approvalRef: stockTake.approvalRef ?? undefined,
        lines: journalLines,
      });
      journalId = journal.id;
    }

    stockTake.status = "POSTED";
    stockTake.journalId = journalId;
    stockTake.updatedBy = postedBy;
    return this.stockTakeRepository.save(stockTake, em);
  }

  async findByIdOrFail(id: string): Promise<InvStockTakeEntity> {
    return this.stockTakeRepository.findByIdOrFail(id);
  }

  async listLines(stockTakeId: string): Promise<InvStockTakeLineEntity[]> {
    return this.stockTakeLineRepository.findByStockTakeId(stockTakeId);
  }

  async list(filter: Parameters<InvStockTakeRepository["list"]>[0] = {}): Promise<InvStockTakeEntity[]> {
    return this.stockTakeRepository.list(filter);
  }
}

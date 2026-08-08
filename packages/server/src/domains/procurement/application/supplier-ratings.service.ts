import { Injectable } from "@nestjs/common";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { ProcSupplierEntity } from "../domain/proc-supplier.entity";
import { ProcGrnLineRepository } from "../infrastructure/proc-grn-line.repository";
import { ProcGrnRepository } from "../infrastructure/proc-grn.repository";
import { ProcPurchaseOrderRepository } from "../infrastructure/proc-purchase-order.repository";
import { ProcSupplierRepository } from "../infrastructure/proc-supplier.repository";

/** Every 20 points of rejection rate drops the computed quality score by 1 point (0% -> 5.00, 100% -> floor 1.00) — see class doc comment. */
const QUALITY_SCORE_REJECTION_DIVISOR = 20;
const MIN_SCORE = 1;
const MAX_SCORE = 5;

function clampScore(score: number): number {
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, score));
}

/**
 * FR-PROC-011.1 supplier ratings: `computeAutoMetrics()` (on-time delivery %
 * + rejection rate) and `setManualRating()` (1-5 manual score).
 *
 * **On-time delivery — NOT computed, by design.** `rating_delivery`/
 * `rating_quality`/`rating_manual` are `NUMERIC(3,2)` (max magnitude 9.99 —
 * see `ProcSupplierEntity`'s own doc comment confirming these are genuine
 * 1-5 style SCORES, never raw percentages, which couldn't fit in `(3,2)`
 * anyway). Computing "on time" requires an expected-delivery-date to compare
 * each `proc_grn.received_at` against — `proc_purchase_order` (the table
 * actually in hand at rating-computation time) carries `order_date`
 * (when the PO was raised) and `issued_at` (when it was issued), and
 * `payment_terms_days` (a PAYMENT term, not a delivery one) and
 * `delivery_terms` (freeform `text`, not a parseable date) — confirmed by
 * reading `proc-purchase-order.entity.ts` in full. NO explicit
 * expected-delivery-date column exists anywhere on that table. Fabricating
 * one (e.g. treating `order_date + payment_terms_days` as a stand-in
 * delivery date, or parsing `delivery_terms` free text) would misuse an
 * unrelated column and produce a number that looks precise but measures
 * nothing real — this pass declines to do that. `rating_delivery` is
 * therefore left UNTOUCHED by `computeAutoMetrics()`; a genuine on-time
 * metric needs a real `expected_delivery_date`-shaped column added to
 * `proc_purchase_order`/`proc_po_line` by a future schema-owning pass.
 *
 * **Rejection rate — genuinely computable, and computed.**
 * `Σ rejected_qty / Σ received_qty` across every `proc_grn_line` ever raised
 * against this supplier's purchase orders (via `proc_grn.po_id ->
 * proc_purchase_order.supplier_id`) — both are real, persisted columns. The
 * resulting percentage is mapped onto the `NUMERIC(3,2)` 1-5 score range via
 * `5 - rejectionRatePercent / 20` (0% rejection -> 5.00; 20%+ progressively
 * lower), clamped to a floor of `1.00` rather than `0` — a supplier with an
 * almost-total rejection rate is a data anomaly better handled via
 * `SuppliersService.blacklist()` (BR-PROC-05) than a zero score. No
 * documented scoring formula exists in the task brief; this linear mapping
 * is a documented judgement call, easy to replace with a different curve
 * later without touching the underlying `Σrejected/Σreceived` computation.
 * `Money` is reused purely as a decimal-scaled accumulator for quantities
 * here (not currency) — the same pattern `GrnService`/`PurchaseOrdersService`
 * already use for `qty`/`received_qty` arithmetic (`proc-po-line.entity.ts`'s
 * own doc comment: no dedicated `Quantity` value type exists yet).
 */
@Injectable()
export class SupplierRatingsService {
  constructor(
    private readonly supplierRepository: ProcSupplierRepository,
    private readonly poRepository: ProcPurchaseOrderRepository,
    private readonly grnRepository: ProcGrnRepository,
    private readonly grnLineRepository: ProcGrnLineRepository,
  ) {}

  /** See class doc comment. Only `rating_quality` (rejection rate) is touched — `rating_delivery` is deliberately left as-is. */
  async computeAutoMetrics(supplierId: string, actorId: string | null = null): Promise<ProcSupplierEntity> {
    const supplier = await this.supplierRepository.findByIdOrFail(supplierId);
    const purchaseOrders = await this.poRepository.list({ supplierId });

    let sumReceivedQty = Money.ZERO;
    let sumRejectedQty = Money.ZERO;
    for (const po of purchaseOrders) {
      const grns = await this.grnRepository.findByPoId(po.id);
      for (const grn of grns) {
        const lines = await this.grnLineRepository.findByGrnId(grn.id);
        for (const line of lines) {
          sumReceivedQty = sumReceivedQty.add(Money.fromDecimalString(line.receivedQty));
          sumRejectedQty = sumRejectedQty.add(Money.fromDecimalString(line.rejectedQty));
        }
      }
    }

    if (!sumReceivedQty.isZero()) {
      const rejectionRatePercent = (Number(sumRejectedQty.toDecimalString()) / Number(sumReceivedQty.toDecimalString())) * 100;
      const qualityScore = clampScore(MAX_SCORE - rejectionRatePercent / QUALITY_SCORE_REJECTION_DIVISOR);
      supplier.ratingQuality = qualityScore.toFixed(2);
    }

    supplier.updatedBy = actorId;
    return this.supplierRepository.save(supplier);
  }

  async setManualRating(supplierId: string, score: number, actorId: string | null = null): Promise<ProcSupplierEntity> {
    if (!Number.isFinite(score) || score < MIN_SCORE || score > MAX_SCORE) {
      throw new ValidationException(`setManualRating: score must be between ${MIN_SCORE} and ${MAX_SCORE}`);
    }
    const supplier = await this.supplierRepository.findByIdOrFail(supplierId);
    supplier.ratingManual = score.toFixed(2);
    supplier.updatedBy = actorId;
    return this.supplierRepository.save(supplier);
  }
}

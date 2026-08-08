import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { GlAccountRepository, PostingService, PostJournalLineDraft } from "../../../accounting";
import { NumberingService, SettingsService } from "../../../platform/settings";
import { ProcSupplierInvoiceEntity, ProcSupplierInvoiceStatus } from "../domain/proc-supplier-invoice.entity";
import { ProcGrnLineRepository } from "../infrastructure/proc-grn-line.repository";
import { ProcGrnRepository } from "../infrastructure/proc-grn.repository";
import { ProcPoLineRepository } from "../infrastructure/proc-po-line.repository";
import { ProcPurchaseOrderRepository } from "../infrastructure/proc-purchase-order.repository";
import { ProcSupplierInvoiceRepository } from "../infrastructure/proc-supplier-invoice.repository";
import { ProcSupplierRepository } from "../infrastructure/proc-supplier.repository";
import { resolveApSupplierControlAccount, resolvePriceVarianceAccount } from "./gl-ap-accounts.util";
import { resolveGrnAccrualAccount } from "./gl-grn-accounts.util";

/** Settings keys FR-PROC-007.1's 3-way match reads for its tolerance dimensions. */
export const INVOICE_MATCH_QTY_TOLERANCE_SETTING_KEY = "procurement.invoice_match_qty_tolerance_percent";
export const INVOICE_MATCH_PRICE_TOLERANCE_SETTING_KEY = "procurement.invoice_match_price_tolerance_percent";
export const INVOICE_MATCH_ABSOLUTE_TOLERANCE_SETTING_KEY = "procurement.invoice_match_absolute_kes";
const DEFAULT_QTY_TOLERANCE_PERCENT = 2;
const DEFAULT_PRICE_TOLERANCE_PERCENT = 2;
const DEFAULT_ABSOLUTE_TOLERANCE_KES = 50;

export type SupplierInvoiceMatchResolution = "ACCEPT_VARIANCE" | "REJECT";

export interface CaptureSupplierInvoiceLineInput {
  poLineId: string;
  qty: string;
  unitPrice: Money;
}

export interface CaptureSupplierInvoiceInput {
  supplierId: string;
  poId?: string | null;
  supplierRef: string;
  invoiceDate: string;
  dueDate: string;
  total: Money;
  /** See class doc comment "capture()" — a data-entry integrity check only, never persisted. */
  lines?: CaptureSupplierInvoiceLineInput[];
}

interface MatchVarianceLine {
  poLineId: string;
  poQty: string;
  grnAcceptedQty: string;
  grnValue: string;
}

interface MatchVarianceResult {
  matchedAt: string;
  poId: string;
  invoiceTotal: string;
  poOrderedQty: string;
  grnAcceptedQty: string;
  grnAcceptedValue: string;
  priceVarianceAmount: string;
  qtyWithinTolerance: boolean;
  priceWithinTolerance: boolean;
  withinTolerance: boolean;
  tolerances: { qtyPercent: number; pricePercent: number; absoluteKes: number };
  lines: MatchVarianceLine[];
  resolution?: { action: SupplierInvoiceMatchResolution; note: string; resolvedAt: string; resolvedBy: string | null };
}

function moneyAbs(value: Money): Money {
  return value.isNegative() ? value.negate() : value;
}

/**
 * `proc_supplier_invoice` capture, FR-PROC-007.1's 3-way match, and P-20
 * posting.
 *
 * **`capture()`** — allocates the real `number` immediately via
 * `NumberingService.allocate(em, 'PROC_SUPPLIER_INVOICE')` (the entity DOES
 * carry a `number` column distinct from `supplier_ref`, confirmed against
 * `docs/phase-4/04-schema-operations.md` §2's own DDL line — `PK, number
 * varchar(30) UQ, supplier_ref varchar(60), ...` — the task brief's own
 * caveat about a possibly-missing `number` column does not apply to what the
 * foundation pass actually built; see `ProcSupplierInvoiceEntity` itself).
 * Mirrors `RequisitionsService.create()`'s reasoning for allocating
 * immediately rather than deferring to a later step: capture IS the terminal
 * creation act here, there is no earlier DRAFT stage. `status='UNMATCHED'`.
 *
 * `lines`, if given, is a **data-entry integrity check only** — it is
 * validated to sum to `total` and to reference only `po_line_id`s that
 * belong to the given `po_id`, then discarded. It is NOT persisted: no
 * `proc_supplier_invoice_line` table exists anywhere in the 13-table DDL the
 * foundation pass built (the same "no `proc_invoice_match` table either —
 * match results live in `match_variance` jsonb instead" gap that pass's own
 * doc comment already flagged). `matchAgainstPo()` therefore cannot compare
 * against the invoice's OWN claimed per-line breakdown — there is nowhere to
 * store one — and instead compares the invoice's header `total` against the
 * PO's own lines + their POSTED GRN receipts, which are real, persisted
 * data. This is a genuine, honest scope narrowing from a per-line 3-way
 * match to a header-level one; `matchAgainstPo()`'s `match_variance.lines`
 * still gives a real per-PO-line "side-by-side" (PO ordered qty vs GRN
 * accepted qty/value) for the API layer's exception-queue UI, just built
 * from PO/GRN data rather than the invoice's own (unpersisted) lines.
 *
 * **`matchAgainstPo(em, invoiceId)`** — requires `po_id` (a captured-without-
 * PO ad-hoc/service invoice cannot be matched this way; see `post()`'s own
 * doc comment for why posting such an invoice is out of scope for this
 * pass). Sums, across every `proc_po_line` of the invoice's PO: the ordered
 * `qty` (`poOrderedQty`), and — from every `proc_grn_line` raised against
 * that PO line whose PARENT `proc_grn.status='POSTED'` only (an unposted
 * DRAFT GRN's received/rejected quantities were never recognized in the GL,
 * so matching against one would compare the invoice against a value that
 * never hit the ledger) — `acceptedQty = received_qty - rejected_qty` and
 * `acceptedQty * unit_cost` (`grnAcceptedQty`/`grnAcceptedValue`). Two
 * independent tolerance dimensions, both read from Settings (defaults
 * 2%/2%/KES 50, per the task brief):
 *  - **qty**: `|poOrderedQty - grnAcceptedQty| <= poOrderedQty * qtyTolerancePercent/100`
 *    — is the PO's receiving substantially complete by the time its invoice
 *    arrives? (Distinct from BR-PROC-03's own per-GRN-line receiving-time
 *    cap — this is an aggregate, invoice-time completeness check.)
 *  - **price**: `invoice.total` vs `grnAcceptedValue` — within tolerance if
 *    EITHER the percentage difference is within `priceTolerancePercent` OR
 *    the absolute KES difference is within `absoluteToleranceKes` (the more
 *    lenient of the two passes — mirrors how a small-dollar invoice can
 *    "fail" a percentage test while still being trivially within the flat
 *    KES tolerance, a common real-world 3-way-match shape).
 * `withinTolerance = qtyWithinTolerance && priceWithinTolerance` — BOTH
 * dimensions must pass to auto-approve; either one failing routes to
 * `MATCH_EXCEPTION`. All Money arithmetic stays in `Money` (ceiling-style
 * `multiply()` comparisons, mirroring `GrnService.receive()`'s own tolerance-
 * ceiling pattern) — no monetary value is ever round-tripped through a raw
 * JS float.
 *
 * **`resolveMatchException()`** — the manual override path for a
 * `MATCH_EXCEPTION` invoice: `ACCEPT_VARIANCE` -> `MATCHED` (an authorized
 * override of the computed variance), `REJECT` -> `UNMATCHED` (back for
 * correction/re-capture). The resolution decision is appended into
 * `match_variance` (never overwrites the original computed comparison — an
 * audit trail of what was computed AND what was decided).
 *
 * **`post(em, invoiceId, postedBy)`** — requires `status='MATCHED'`. Reads
 * `grnAcceptedValue` back out of the `match_variance` this invoice's own
 * `matchAgainstPo()` call wrote (never re-derived from scratch at posting
 * time, so posting reflects exactly what was matched/approved, including any
 * `resolveMatchException('ACCEPT_VARIANCE', ...)` override — the override
 * changes `status`, not the underlying `grnAcceptedValue` figure). ONE
 * `PostingService.post()` call realizes P-20: debit `GRN Accrual` (`2015`,
 * `gl-grn-accounts.util.ts`) for `grnAcceptedValue` (settling what P-18/P-19
 * accrued at GRN-posting time); if `invoice.total > grnAcceptedValue`, an
 * ADDITIONAL debit to `Purchase Price Variance` (`5060`) for the difference
 * (we are paying more than what was accrued — an unfavorable variance,
 * itself an expense); if `invoice.total < grnAcceptedValue`, a CREDIT to the
 * same `5060` for the difference instead (a favorable variance, reducing net
 * expense); if they are exactly equal, no variance line at all. Credit
 * `AP_SUPPLIER` (`gl-ap-accounts.util.ts`) for the full `invoice.total` —
 * the debits above always sum to exactly `invoice.total` regardless of which
 * variance direction applies, so the journal balances by construction (see
 * the arithmetic identity in this method's own inline comment). No
 * `NumberingService` call here — the real `number` was already allocated at
 * `capture()` time (see that method's own doc comment).
 *
 * **Non-PO invoices** (`po_id IS NULL`, a legitimate DDL shape per
 * `ProcSupplierInvoiceEntity`'s own doc comment for ad-hoc/service invoices)
 * cannot reach `MATCHED` via `matchAgainstPo()` (which requires a `po_id`),
 * and `post()`'s P-20 posting map is specifically "settle the GRN accrual" —
 * a non-PO invoice has no GRN accrual to settle and no alternative GL
 * treatment is specified anywhere in the task brief or the source DDL.
 * Capturing a non-PO invoice is fully supported (the entity allows it);
 * matching/posting one is out of scope for this pass, a documented forward
 * gap for whichever future pass adds a genuine non-PO/expense-invoice
 * posting map.
 */
@Injectable()
export class SupplierInvoicesService {
  constructor(
    private readonly invoiceRepository: ProcSupplierInvoiceRepository,
    private readonly supplierRepository: ProcSupplierRepository,
    private readonly poRepository: ProcPurchaseOrderRepository,
    private readonly poLineRepository: ProcPoLineRepository,
    private readonly grnRepository: ProcGrnRepository,
    private readonly grnLineRepository: ProcGrnLineRepository,
    private readonly glAccountRepository: GlAccountRepository,
    private readonly postingService: PostingService,
    private readonly numberingService: NumberingService,
    private readonly settingsService: SettingsService,
  ) {}

  async capture(
    em: EntityManager,
    input: CaptureSupplierInvoiceInput,
    actorId: string | null,
  ): Promise<ProcSupplierInvoiceEntity> {
    if (!input.total.isPositive()) {
      throw new ValidationException("ck_proc_supplier_invoice_total_positive: total must be > 0");
    }
    const supplier = await this.supplierRepository.findByIdOrFail(input.supplierId, em);

    let poId: string | null = null;
    if (input.poId) {
      const po = await this.poRepository.findByIdOrFail(input.poId, em);
      poId = po.id;
    }

    if (input.lines && input.lines.length > 0) {
      const linesTotal = input.lines.reduce((sum, line) => sum.add(line.unitPrice.multiply(line.qty)), Money.ZERO);
      if (!linesTotal.equals(input.total)) {
        throw new ValidationException(
          `capture(): supplied lines sum to ${linesTotal.toDecimalString()} but total is ${input.total.toDecimalString()} ` +
            "(lines are a data-entry integrity check only — proc_supplier_invoice has no persisted line table, see class doc comment)",
        );
      }
      if (poId) {
        const poLines = await this.poLineRepository.findByPoId(poId, em);
        const poLineIds = new Set(poLines.map((line) => line.id));
        const invalid = input.lines.filter((line) => !poLineIds.has(line.poLineId));
        if (invalid.length > 0) {
          throw new ValidationException(
            `capture(): line poLineId(s) not on PO ${poId}: ${invalid.map((line) => line.poLineId).join(", ")}`,
          );
        }
      }
    }

    const number = await this.numberingService.allocate(em, "PROC_SUPPLIER_INVOICE");
    return this.invoiceRepository.create(
      {
        number,
        supplierRef: input.supplierRef,
        supplierId: supplier.id,
        poId,
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate,
        total: input.total,
        status: "UNMATCHED",
        matchVariance: null,
        approvalRef: null,
        journalId: null,
        paidAmount: Money.ZERO,
        createdBy: actorId,
        updatedBy: actorId,
      },
      em,
    );
  }

  async findByIdOrFail(id: string): Promise<ProcSupplierInvoiceEntity> {
    return this.invoiceRepository.findByIdOrFail(id);
  }

  async list(filter: { status?: ProcSupplierInvoiceStatus; supplierId?: string } = {}): Promise<ProcSupplierInvoiceEntity[]> {
    return this.invoiceRepository.list(filter);
  }

  /** See class doc comment "matchAgainstPo()". */
  async matchAgainstPo(em: EntityManager, invoiceId: string, actorId: string | null = null): Promise<ProcSupplierInvoiceEntity> {
    const invoice = await this.invoiceRepository.findByIdOrFail(invoiceId, em);
    if (invoice.status !== "UNMATCHED") {
      throw new ValidationException(`Only an UNMATCHED supplier invoice can be matched (invoice ${invoiceId} status=${invoice.status})`);
    }
    if (!invoice.poId) {
      throw new ValidationException(
        `FR-PROC-007.1: matchAgainstPo() requires po_id — invoice ${invoiceId} was captured without one (ad-hoc/service invoice); see class doc comment`,
      );
    }

    const poLines = await this.poLineRepository.findByPoId(invoice.poId, em);
    if (poLines.length === 0) {
      throw new ValidationException(`PO ${invoice.poId} has no lines — nothing to match against`);
    }

    let poQtyTotal = Money.ZERO;
    let grnQtyTotal = Money.ZERO;
    let grnValueTotal = Money.ZERO;
    const lineDetails: MatchVarianceLine[] = [];

    for (const poLine of poLines) {
      const grnLines = await this.grnLineRepository.findByPoLineId(poLine.id, em);
      let lineGrnQty = Money.ZERO;
      let lineGrnValue = Money.ZERO;
      for (const grnLine of grnLines) {
        const grn = await this.grnRepository.findByIdOrFail(grnLine.grnId, em);
        if (grn.status !== "POSTED") continue; // only GL-recognized receipts count — see class doc comment
        const accepted = Money.fromDecimalString(grnLine.receivedQty).subtract(Money.fromDecimalString(grnLine.rejectedQty));
        lineGrnQty = lineGrnQty.add(accepted);
        lineGrnValue = lineGrnValue.add(grnLine.unitCost.multiply(accepted.toDecimalString()));
      }
      poQtyTotal = poQtyTotal.add(Money.fromDecimalString(poLine.qty));
      grnQtyTotal = grnQtyTotal.add(lineGrnQty);
      grnValueTotal = grnValueTotal.add(lineGrnValue);
      lineDetails.push({
        poLineId: poLine.id,
        poQty: poLine.qty,
        grnAcceptedQty: lineGrnQty.toDecimalString(),
        grnValue: lineGrnValue.toDecimalString(),
      });
    }

    const qtyTolerancePercent = await this.settingsService.getTyped<number>(
      INVOICE_MATCH_QTY_TOLERANCE_SETTING_KEY,
      DEFAULT_QTY_TOLERANCE_PERCENT,
    );
    const priceTolerancePercent = await this.settingsService.getTyped<number>(
      INVOICE_MATCH_PRICE_TOLERANCE_SETTING_KEY,
      DEFAULT_PRICE_TOLERANCE_PERCENT,
    );
    const absoluteToleranceKes = await this.settingsService.getTyped<number>(
      INVOICE_MATCH_ABSOLUTE_TOLERANCE_SETTING_KEY,
      DEFAULT_ABSOLUTE_TOLERANCE_KES,
    );

    const qtyVarianceAbs = moneyAbs(poQtyTotal.subtract(grnQtyTotal));
    const qtyToleranceCeiling = poQtyTotal.multiply((qtyTolerancePercent / 100).toString());
    const qtyWithinTolerance = qtyVarianceAbs.compare(qtyToleranceCeiling) <= 0;

    const priceVarianceAmount = invoice.total.subtract(grnValueTotal);
    const priceVarianceAbs = moneyAbs(priceVarianceAmount);
    const priceToleranceFromPercent = grnValueTotal.multiply((priceTolerancePercent / 100).toString());
    const absoluteTolerance = Money.fromDecimalString(String(absoluteToleranceKes));
    const priceWithinTolerance =
      priceVarianceAbs.compare(absoluteTolerance) <= 0 ||
      (!grnValueTotal.isZero() && priceVarianceAbs.compare(priceToleranceFromPercent) <= 0);

    const withinTolerance = qtyWithinTolerance && priceWithinTolerance;

    const matchVariance: MatchVarianceResult = {
      matchedAt: new Date().toISOString(),
      poId: invoice.poId,
      invoiceTotal: invoice.total.toDecimalString(),
      poOrderedQty: poQtyTotal.toDecimalString(),
      grnAcceptedQty: grnQtyTotal.toDecimalString(),
      grnAcceptedValue: grnValueTotal.toDecimalString(),
      priceVarianceAmount: priceVarianceAmount.toDecimalString(),
      qtyWithinTolerance,
      priceWithinTolerance,
      withinTolerance,
      tolerances: { qtyPercent: qtyTolerancePercent, pricePercent: priceTolerancePercent, absoluteKes: absoluteToleranceKes },
      lines: lineDetails,
    };

    invoice.status = withinTolerance ? "MATCHED" : "MATCH_EXCEPTION";
    invoice.matchVariance = matchVariance as unknown as Record<string, unknown>;
    invoice.updatedBy = actorId;
    return this.invoiceRepository.save(invoice, em);
  }

  /** See class doc comment "resolveMatchException()". */
  async resolveMatchException(
    em: EntityManager,
    invoiceId: string,
    resolution: SupplierInvoiceMatchResolution,
    note: string,
    actorId: string | null = null,
  ): Promise<ProcSupplierInvoiceEntity> {
    const invoice = await this.invoiceRepository.findByIdOrFail(invoiceId, em);
    if (invoice.status !== "MATCH_EXCEPTION") {
      throw new ValidationException(`Only a MATCH_EXCEPTION supplier invoice can be resolved (invoice ${invoiceId} status=${invoice.status})`);
    }
    if (!note || note.trim().length === 0) {
      throw new ValidationException("resolveMatchException() requires a non-empty note");
    }
    const existing = (invoice.matchVariance ?? {}) as Record<string, unknown>;
    invoice.matchVariance = {
      ...existing,
      resolution: { action: resolution, note, resolvedAt: new Date().toISOString(), resolvedBy: actorId },
    };
    invoice.status = resolution === "ACCEPT_VARIANCE" ? "MATCHED" : "UNMATCHED";
    invoice.updatedBy = actorId;
    return this.invoiceRepository.save(invoice, em);
  }

  /** See class doc comment "post()". */
  async post(em: EntityManager, invoiceId: string, postedBy: string): Promise<ProcSupplierInvoiceEntity> {
    const invoice = await this.invoiceRepository.findByIdOrFail(invoiceId, em);
    if (invoice.status !== "MATCHED") {
      throw new ValidationException(`Only a MATCHED supplier invoice can be posted (invoice ${invoiceId} status=${invoice.status})`);
    }
    const variance = invoice.matchVariance as { grnAcceptedValue?: string } | null;
    if (!variance || variance.grnAcceptedValue === undefined) {
      throw new ValidationException(
        `Supplier invoice ${invoiceId} has no recorded match_variance.grnAcceptedValue — matchAgainstPo() must run before post()`,
      );
    }
    const grnValue = Money.fromDecimalString(variance.grnAcceptedValue);
    // Identity: grnValue (+/- variance) always sums to invoice.total, so the
    // journal balances regardless of variance direction — see class doc
    // comment "post()".
    const priceVarianceAmount = invoice.total.subtract(grnValue);

    const journalLines: PostJournalLineDraft[] = [];
    const grnAccrualAccount = await resolveGrnAccrualAccount(this.glAccountRepository, em);
    journalLines.push({
      accountId: grnAccrualAccount.id,
      debit: grnValue,
      credit: Money.ZERO,
      memo: "P-20 GRN accrual settled",
      entityRefType: "proc_supplier_invoice",
      entityRefId: invoice.id,
    });

    if (priceVarianceAmount.isPositive()) {
      const varianceAccount = await resolvePriceVarianceAccount(this.glAccountRepository, em);
      journalLines.push({
        accountId: varianceAccount.id,
        debit: priceVarianceAmount,
        credit: Money.ZERO,
        memo: "P-20 purchase price variance (invoice > GRN)",
        entityRefType: "proc_supplier_invoice",
        entityRefId: invoice.id,
      });
    } else if (priceVarianceAmount.isNegative()) {
      const varianceAccount = await resolvePriceVarianceAccount(this.glAccountRepository, em);
      journalLines.push({
        accountId: varianceAccount.id,
        debit: Money.ZERO,
        credit: priceVarianceAmount.negate(),
        memo: "P-20 purchase price variance (invoice < GRN)",
        entityRefType: "proc_supplier_invoice",
        entityRefId: invoice.id,
      });
    }

    const apAccount = await resolveApSupplierControlAccount(this.glAccountRepository, em);
    journalLines.push({
      accountId: apAccount.id,
      debit: Money.ZERO,
      credit: invoice.total,
      memo: "P-20 AP - Suppliers",
      entityRefType: "proc_supplier_invoice",
      entityRefId: invoice.id,
    });

    const journal = await this.postingService.post(em, {
      journalDate: invoice.invoiceDate,
      sourceModule: "procurement",
      sourceDocType: "proc_supplier_invoice",
      sourceDocId: invoice.id,
      narration: `Supplier invoice ${invoice.number} (${invoice.supplierRef}) posted`,
      journalType: "MANUAL",
      postedBy,
      lines: journalLines,
    });

    invoice.status = "POSTED";
    invoice.journalId = journal.id;
    invoice.updatedBy = postedBy;
    return this.invoiceRepository.save(invoice, em);
  }
}

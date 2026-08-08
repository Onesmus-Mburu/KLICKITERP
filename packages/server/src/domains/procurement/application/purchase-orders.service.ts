import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";
import { ApprovalEngineService } from "../../../platform/approvals";
import { NumberingService } from "../../../platform/settings";
import {
  PROC_PURCHASE_ORDER_MUTABLE_STATUSES,
  ProcPurchaseOrderEntity,
  ProcPurchaseOrderStatus,
} from "../domain/proc-purchase-order.entity";
import { ProcRequisitionEntity } from "../domain/proc-requisition.entity";
import { ProcPoLineEntity } from "../domain/proc-po-line.entity";
import { ProcPoLineRepository } from "../infrastructure/proc-po-line.repository";
import { ListProcPurchaseOrdersFilter, ProcPurchaseOrderRepository } from "../infrastructure/proc-purchase-order.repository";
import { ProcQuotationRepository } from "../infrastructure/proc-quotation.repository";
import { ProcRequisitionRepository } from "../infrastructure/proc-requisition.repository";
import { ProcSupplierRepository } from "../infrastructure/proc-supplier.repository";
import { RequisitionsService } from "./requisitions.service";

/** `appr_workflow_def.domain_code` this module submits POs under — see `RequisitionsService`'s identical doc comment for the Pass-B seed bootstrapping caveat. */
export const PROCUREMENT_PO_APPROVAL_DOMAIN_CODE = "PROCUREMENT_PO";

export interface CreatePurchaseOrderLineInput {
  itemId?: string | null;
  description: string;
  qty: string;
  unitPrice: Money;
}

export interface CreatePurchaseOrderFromRequisitionInput {
  /** Required unless `bypassRequisition=true` — BR-PROC-01's direct-PO escape hatch, see class doc comment. */
  requisitionId?: string | null;
  quotationId?: string | null;
  supplierId: string;
  /** Defaults to today (UTC date). */
  orderDate?: string;
  deliveryTerms?: string | null;
  lines: CreatePurchaseOrderLineInput[];
  /**
   * BR-PROC-01: "no PO without approved requisition (unless direct-PO
   * permission)". This service accepts the flag and trusts the caller —
   * gating it behind a real "direct-PO" permission code is explicitly a
   * Pass-B `api/`/controller-layer concern (no controllers exist in this
   * pass); a Pass B controller MUST check `@RequirePermission('procurement:
   * po:direct-create')` (or similar, permission catalogue TBD in Pass B)
   * before ever passing `bypassRequisition: true` through to this method.
   */
  bypassRequisition?: boolean;
}

export interface RevisePurchaseOrderInput {
  supplierId?: string;
  deliveryTerms?: string | null;
  /** Omit to carry the original PO's lines forward unchanged. */
  lines?: CreatePurchaseOrderLineInput[];
}

/** Strips a trailing "-R<n>" revision suffix — see `revise()`'s doc comment for why PO numbers are built this way. */
function baseNumber(number: string): string {
  return number.replace(/-R\d+$/, "");
}

/**
 * `proc_purchase_order` (+`proc_po_line`) workflow: create from an approved
 * requisition (or bypass it), submit -> approve/reject, issue (the
 * `trg_proc_po_immutable` freeze point), revise (creates a new superseding
 * row), and the receiving-status rollup `GrnService` drives.
 *
 * **Numbering** — `createFromRequisition()`/`revise()` both start with a
 * `DRAFT-<uuid>` placeholder `number` (mirrors `InvoicingService.
 * generateInvoice()`'s precedent: a DRAFT PO's number isn't meaningful until
 * it's actually ISSUED). `issue()` allocates the real number: a fresh
 * sequence via `NumberingService.allocate(em, 'PROC_PO')` for an original
 * PO, or — for a revision (`supersedes_id` set) — `${originalBaseNumber}-R
 * ${revision}`, so the human-facing number stays anchored to the ORIGINAL
 * PO's own allocated number (FR-PROC-004.1's "PO-n Rev m" naming), never
 * burning a fresh sequence value per revision. `uq_proc_purchase_order_number`
 * (a plain, non-partial unique index across ALL rows regardless of status)
 * still holds because each revision's suffix is unique.
 *
 * **`revise()` / PO-revision-superseding judgement call** (the task brief's
 * own flagged ambiguity — no `SUPERSEDED` status exists in the DDL's
 * `proc_purchase_order` CHECK list): `revise()` itself only creates the new
 * `DRAFT` row (`supersedes_id` set, `revision = original.revision + 1`) —
 * the ORIGINAL PO's status is left untouched at that moment. The original is
 * only flipped to `CANCELLED` inside `issue()`, at the point the REVISION
 * itself actually reaches `ISSUED` (see `issue()`'s own doc comment for why
 * this timing was chosen over cancelling at `revise()`-creation time).
 *
 * **BR-PROC-05** (blacklisted suppliers block NEW POs) is enforced here —
 * not in `SuppliersService`, per that service's own doc comment — in both
 * `createFromRequisition()` and `revise()` (a revision that switches
 * supplier is still "a new PO" for this purpose).
 */
@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly poRepository: ProcPurchaseOrderRepository,
    private readonly poLineRepository: ProcPoLineRepository,
    private readonly supplierRepository: ProcSupplierRepository,
    private readonly requisitionRepository: ProcRequisitionRepository,
    private readonly quotationRepository: ProcQuotationRepository,
    private readonly requisitionsService: RequisitionsService,
    private readonly approvalEngine: ApprovalEngineService,
    private readonly numberingService: NumberingService,
  ) {}

  async createFromRequisition(
    em: EntityManager,
    input: CreatePurchaseOrderFromRequisitionInput,
    initiatorId: string,
  ): Promise<ProcPurchaseOrderEntity> {
    if (input.lines.length === 0) {
      throw new ValidationException("A purchase order needs at least one line");
    }

    let requisition: ProcRequisitionEntity | null = null;
    if (!input.bypassRequisition) {
      if (!input.requisitionId) {
        throw new ValidationException(
          "requisitionId is required unless bypassRequisition=true (a direct-PO permission escape hatch — see class doc comment)",
        );
      }
      requisition = await this.requisitionRepository.findByIdOrFail(input.requisitionId, em);
      if (requisition.status !== "APPROVED") {
        throw new ValidationException(
          `BR-PROC-01: PO creation requires an APPROVED requisition unless bypassRequisition=true (requisition ${input.requisitionId} status=${requisition.status})`,
        );
      }
    } else if (input.requisitionId) {
      requisition = await this.requisitionRepository.findById(input.requisitionId, em);
    }

    const supplier = await this.supplierRepository.findByIdOrFail(input.supplierId, em);
    if (supplier.status === "BLACKLISTED") {
      throw new ValidationException(`BR-PROC-05: supplier ${input.supplierId} is BLACKLISTED — cannot receive a new PO`);
    }

    let quotationTerms: string | null = null;
    if (input.quotationId) {
      const quotation = await this.quotationRepository.findByIdOrFail(input.quotationId, em);
      if (requisition && quotation.requisitionId !== requisition.id) {
        throw new ValidationException(`Quotation ${input.quotationId} does not belong to requisition ${requisition.id}`);
      }
      quotationTerms = quotation.terms;
    }

    const subtotal = input.lines.reduce((sum, line) => sum.add(line.unitPrice.multiply(line.qty)), Money.ZERO);
    const taxAmount = Money.ZERO; // No tax computation in this pass — documented; a future pass can extend the input shape.
    const total = subtotal.add(taxAmount);

    const poId = generateUuidV7();
    const po = await this.poRepository.create(
      {
        id: poId,
        // `number varchar(30)` (migration 0100) can't hold "DRAFT-" (6) + a full UUID (36) = 42
        // chars — truncate the hyphen-stripped UUID to fit.
        number: `DRAFT-${poId.replace(/-/g, "").slice(0, 24)}`,
        revision: 0,
        supersedesId: null,
        supplierId: supplier.id,
        requisitionId: requisition?.id ?? null,
        quotationId: input.quotationId ?? null,
        status: "DRAFT",
        approvalRef: null,
        orderDate: input.orderDate ?? new Date().toISOString().slice(0, 10),
        deliveryTerms: input.deliveryTerms !== undefined ? input.deliveryTerms : quotationTerms,
        // Snapshot from proc_supplier.payment_terms_days (N-4) — see ProcPurchaseOrderEntity's doc comment.
        paymentTermsDays: supplier.paymentTermsDays,
        subtotal,
        taxAmount,
        total,
        issuedAt: null,
        createdBy: initiatorId,
        updatedBy: initiatorId,
      },
      em,
    );

    await this.createLines(em, po.id, input.lines, initiatorId);

    if (requisition && !input.bypassRequisition) {
      await this.requisitionsService.markConverted(requisition.id, initiatorId, em);
    }

    return po;
  }

  async findByIdOrFail(id: string): Promise<ProcPurchaseOrderEntity> {
    return this.poRepository.findByIdOrFail(id);
  }

  async list(filter: ListProcPurchaseOrdersFilter = {}): Promise<ProcPurchaseOrderEntity[]> {
    return this.poRepository.list(filter);
  }

  async listLines(poId: string): Promise<ProcPoLineEntity[]> {
    return this.poLineRepository.findByPoId(poId);
  }

  async submitForApproval(em: EntityManager, poId: string, initiatorId: string): Promise<ProcPurchaseOrderEntity> {
    const po = await this.poRepository.findByIdOrFail(poId, em);
    if (po.status !== "DRAFT") {
      throw new ValidationException(`Only a DRAFT purchase order can be submitted for approval (status=${po.status})`);
    }
    const instance = await this.approvalEngine.submit(em, {
      domainCode: PROCUREMENT_PO_APPROVAL_DOMAIN_CODE,
      entityType: "proc_purchase_order",
      entityId: po.id,
      amount: po.total,
      initiatorId,
    });
    po.status = "PENDING_APPROVAL";
    po.approvalRef = instance.id;
    po.updatedBy = initiatorId;
    return this.poRepository.save(po, em);
  }

  /** Manual-trigger interim pattern — see `RequisitionsService.onApprovalDecided()`. Rejection returns the PO to DRAFT for correction/resubmission. */
  async onApprovalDecided(poId: string, approved: boolean, actorId: string | null = null): Promise<ProcPurchaseOrderEntity> {
    const po = await this.poRepository.findByIdOrFail(poId);
    if (po.status !== "PENDING_APPROVAL") {
      throw new ValidationException(`proc_purchase_order ${poId} is not PENDING_APPROVAL (status=${po.status})`);
    }
    po.status = approved ? "APPROVED" : "DRAFT";
    po.updatedBy = actorId;
    return this.poRepository.save(po);
  }

  /**
   * `status='ISSUED'`, `issued_at=now()` — the point `trg_proc_po_immutable`
   * starts freezing `subtotal`/`tax_amount`/`total`/`supplier_id`. Also
   * resolves the real `number` (see class doc comment) and, for a revision,
   * cancels the superseded original in the SAME transaction — see class doc
   * comment "revise() / PO-revision-superseding judgement call" for why this
   * timing (not `revise()`-creation time) was chosen: a revision that never
   * gets issued (rejected mid-approval) must never leave the requisition
   * with zero active POs.
   */
  async issue(em: EntityManager, poId: string, actorId: string | null = null): Promise<ProcPurchaseOrderEntity> {
    const po = await this.poRepository.findByIdOrFail(poId, em);
    if (po.status !== "APPROVED") {
      throw new ValidationException(`Only an APPROVED purchase order can be issued (po ${poId} status=${po.status})`);
    }

    let original: ProcPurchaseOrderEntity | null = null;
    if (po.supersedesId) {
      original = await this.poRepository.findByIdOrFail(po.supersedesId, em);
      po.number = `${baseNumber(original.number)}-R${po.revision}`;
    } else {
      po.number = await this.numberingService.allocate(em, "PROC_PO");
    }

    po.status = "ISSUED";
    po.issuedAt = new Date();
    po.updatedBy = actorId;
    const saved = await this.poRepository.save(po, em);

    if (original) {
      original.status = "CANCELLED";
      original.updatedBy = actorId;
      await this.poRepository.save(original, em);
    }

    return saved;
  }

  /**
   * Creates a NEW `proc_purchase_order` row (`revision = original.revision +
   * 1`, `supersedes_id = original.id`, `status='DRAFT'`) re-entering the
   * DRAFT -> approval -> ISSUED cycle (FR-PROC-004.1) — never edits the
   * original's frozen commercial columns in place. Only legal once the
   * original has ever reached `ISSUED` or `PARTIALLY_RECEIVED` (a `DRAFT`/
   * `PENDING_APPROVAL`/`APPROVED` PO should just be edited directly, and a
   * `RECEIVED`/`CLOSED`/`CANCELLED` PO has nothing left to revise).
   */
  async revise(
    em: EntityManager,
    originalPoId: string,
    changes: RevisePurchaseOrderInput,
    initiatorId: string,
  ): Promise<ProcPurchaseOrderEntity> {
    const original = await this.poRepository.findByIdOrFail(originalPoId, em);
    if (PROC_PURCHASE_ORDER_MUTABLE_STATUSES.includes(original.status)) {
      throw new ValidationException(
        `A purchase order can only be revised once ISSUED or beyond — edit the DRAFT PO directly instead (po ${originalPoId} status=${original.status})`,
      );
    }
    if (!["ISSUED", "PARTIALLY_RECEIVED"].includes(original.status)) {
      throw new ValidationException(`Cannot revise a purchase order in status=${original.status}`);
    }
    if (changes.lines && changes.lines.length === 0) {
      throw new ValidationException("revise() lines, if supplied, must be non-empty");
    }

    const supplierId = changes.supplierId ?? original.supplierId;
    const supplier = await this.supplierRepository.findByIdOrFail(supplierId, em);
    if (supplier.status === "BLACKLISTED") {
      throw new ValidationException(`BR-PROC-05: supplier ${supplierId} is BLACKLISTED — cannot issue a revised PO`);
    }

    const lineInputs: CreatePurchaseOrderLineInput[] =
      changes.lines ??
      (await this.poLineRepository.findByPoId(originalPoId, em)).map((line) => ({
        itemId: line.itemId,
        description: line.description,
        qty: line.qty,
        unitPrice: line.unitPrice,
      }));
    const subtotal = lineInputs.reduce((sum, line) => sum.add(line.unitPrice.multiply(line.qty)), Money.ZERO);
    const taxAmount = Money.ZERO;
    const total = subtotal.add(taxAmount);

    const revisionId = generateUuidV7();
    const revisionNumber = original.revision + 1;
    const revised = await this.poRepository.create(
      {
        id: revisionId,
        // `number varchar(30)` (migration 0100) can't hold "DRAFT-" (6) + a full UUID (36) = 42
        // chars — truncate the hyphen-stripped UUID to fit.
        number: `DRAFT-${revisionId.replace(/-/g, "").slice(0, 24)}`,
        revision: revisionNumber,
        supersedesId: original.id,
        supplierId,
        requisitionId: original.requisitionId,
        quotationId: original.quotationId,
        status: "DRAFT",
        approvalRef: null,
        orderDate: original.orderDate,
        deliveryTerms: changes.deliveryTerms !== undefined ? changes.deliveryTerms : original.deliveryTerms,
        paymentTermsDays: supplier.paymentTermsDays,
        subtotal,
        taxAmount,
        total,
        issuedAt: null,
        createdBy: initiatorId,
        updatedBy: initiatorId,
      },
      em,
    );

    await this.createLines(em, revised.id, lineInputs, initiatorId);

    return revised;
  }

  /**
   * Recomputes `status` (`ISSUED`/`PARTIALLY_RECEIVED`/`RECEIVED`) from the
   * aggregate `received_qty` vs `qty` across every `proc_po_line` — called by
   * `GrnService` after it increments line-level `received_qty`, never
   * invoked directly by a controller.
   */
  async updateReceivingStatus(em: EntityManager, poId: string): Promise<ProcPurchaseOrderEntity> {
    const po = await this.poRepository.findByIdOrFail(poId, em);
    if (!["ISSUED", "PARTIALLY_RECEIVED"].includes(po.status)) {
      return po; // defensive no-op outside the receivable window
    }
    const lines = await this.poLineRepository.findByPoId(poId, em);
    const totalQty = lines.reduce((sum, l) => sum.add(Money.fromDecimalString(l.qty)), Money.ZERO);
    const totalReceived = lines.reduce((sum, l) => sum.add(Money.fromDecimalString(l.receivedQty)), Money.ZERO);

    let nextStatus: ProcPurchaseOrderStatus;
    if (totalReceived.isZero()) {
      nextStatus = "ISSUED";
    } else if (totalReceived.compare(totalQty) >= 0) {
      nextStatus = "RECEIVED";
    } else {
      nextStatus = "PARTIALLY_RECEIVED";
    }

    if (nextStatus === po.status) return po;
    po.status = nextStatus;
    return this.poRepository.save(po, em);
  }

  private async createLines(
    em: EntityManager,
    poId: string,
    lines: CreatePurchaseOrderLineInput[],
    actorId: string | null,
  ): Promise<void> {
    let lineNo = 1;
    for (const line of lines) {
      await this.poLineRepository.create(
        {
          poId,
          lineNo: lineNo++,
          itemId: line.itemId ?? null,
          description: line.description,
          qty: line.qty,
          unitPrice: line.unitPrice,
          receivedQty: "0",
          createdBy: actorId,
          updatedBy: actorId,
        },
        em,
      );
    }
  }
}

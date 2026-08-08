import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { ProcSupplierEntity } from "./proc-supplier.entity";
import { ProcRequisitionEntity } from "./proc-requisition.entity";
import { ProcQuotationEntity } from "./proc-quotation.entity";

export type ProcPurchaseOrderStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "ISSUED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CLOSED"
  | "CANCELLED";
export const PROC_PURCHASE_ORDER_STATUSES: readonly ProcPurchaseOrderStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "ISSUED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CLOSED",
  "CANCELLED",
];

/** Statuses at/after which `trg_proc_po_immutable` (migration `0100`) freezes the commercial header columns. */
export const PROC_PURCHASE_ORDER_MUTABLE_STATUSES: readonly ProcPurchaseOrderStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
];

/**
 * Maps to `proc_purchase_order` (docs/phase-4/04-schema-operations.md §2).
 * Module 12 (Procurement) **foundation pass only**.
 *
 * `MutableBaseEntity` — real status progression across the full
 * DRAFT->...->CLOSED/CANCELLED lifecycle plus `issued_at` written once at
 * issuance.
 *
 * **FR-PROC-004.1 immutability**: once `status` has ever reached `ISSUED` or
 * beyond (`status NOT IN ('DRAFT','PENDING_APPROVAL','APPROVED')`), a
 * revision must create a NEW `proc_purchase_order` row referencing this one
 * via `supersedes_id`, never edit this row's commercial content in place.
 * `trg_proc_po_immutable` (migration `0100`) enforces this at the DB layer,
 * scoped — mirroring `trg_bill_invoice_immutable`'s minimal explicit-column
 * style rather than a blanket freeze — to exactly `subtotal`/`tax_amount`/
 * `total`/`supplier_id`, the columns the task brief names; `status`/
 * `issued_at`/`version` (and everything else, e.g. `delivery_terms`/
 * `payment_terms_days`, left as a deliberately narrower scope than the DDL's
 * blanket "immutable once ISSUED" comment — broader PO-content immutability
 * is a service-layer concern for the next pass) remain ordinarily writable.
 *
 * `payment_terms_days` is a **snapshot** copied from `proc_supplier.
 * payment_terms_days` at PO-creation time (the DDL's own "snapshot (N-4)"
 * comment) — later changes to the supplier's own terms must not retroactively
 * change an already-created PO.
 */
@Entity("proc_purchase_order")
@Index("uq_proc_purchase_order_number", ["number"], { unique: true })
@Check(
  "ck_proc_purchase_order_status",
  `"status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','ISSUED','PARTIALLY_RECEIVED','RECEIVED','CLOSED','CANCELLED')`,
)
export class ProcPurchaseOrderEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "number" })
  number!: string;

  @Column({ type: "int", name: "revision", default: 0 })
  revision!: number;

  @Column({ type: "uuid", name: "supersedes_id", nullable: true })
  supersedesId!: string | null;

  @ManyToOne(() => ProcPurchaseOrderEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "supersedes_id" })
  supersedes?: ProcPurchaseOrderEntity | null;

  @Column({ type: "uuid", name: "supplier_id" })
  supplierId!: string;

  @ManyToOne(() => ProcSupplierEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "supplier_id" })
  supplier?: ProcSupplierEntity;

  @Column({ type: "uuid", name: "requisition_id", nullable: true })
  requisitionId!: string | null;

  @ManyToOne(() => ProcRequisitionEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "requisition_id" })
  requisition?: ProcRequisitionEntity | null;

  @Column({ type: "uuid", name: "quotation_id", nullable: true })
  quotationId!: string | null;

  @ManyToOne(() => ProcQuotationEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "quotation_id" })
  quotation?: ProcQuotationEntity | null;

  @Column({ type: "varchar", length: 15, name: "status" })
  status!: ProcPurchaseOrderStatus;

  /** Loose uuid, no FK — `platform/approvals` is deliberately not in this foundation pass's `mayImport` list. */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;

  @Column({ type: "date", name: "order_date" })
  orderDate!: string;

  @Column({ type: "text", name: "delivery_terms", nullable: true })
  deliveryTerms!: string | null;

  /** Snapshot from `proc_supplier.payment_terms_days` at creation time — see class doc comment. */
  @Column({ type: "int", name: "payment_terms_days" })
  paymentTermsDays!: number;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "subtotal",
    default: 0,
    transformer: RequiredMoneyTransformer,
  })
  subtotal!: Money;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "tax_amount",
    default: 0,
    transformer: RequiredMoneyTransformer,
  })
  taxAmount!: Money;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "total",
    default: 0,
    transformer: RequiredMoneyTransformer,
  })
  total!: Money;

  @Column({ type: "timestamptz", name: "issued_at", nullable: true })
  issuedAt!: Date | null;
}

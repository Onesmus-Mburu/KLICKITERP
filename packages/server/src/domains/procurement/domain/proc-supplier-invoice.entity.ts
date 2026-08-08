import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { GlJournalEntity } from "../../../accounting";
import { ProcSupplierEntity } from "./proc-supplier.entity";
import { ProcPurchaseOrderEntity } from "./proc-purchase-order.entity";

export type ProcSupplierInvoiceStatus =
  | "UNMATCHED"
  | "MATCH_EXCEPTION"
  | "MATCHED"
  | "POSTED"
  | "PAID"
  | "PARTIALLY_PAID";
export const PROC_SUPPLIER_INVOICE_STATUSES: readonly ProcSupplierInvoiceStatus[] = [
  "UNMATCHED",
  "MATCH_EXCEPTION",
  "MATCHED",
  "POSTED",
  "PAID",
  "PARTIALLY_PAID",
];
/** Statuses `ix_proc_inv_supplier_open` (BR-PROC-04) indexes as "open" for supplier-payment lookups. */
export const PROC_SUPPLIER_INVOICE_OPEN_STATUSES: readonly ProcSupplierInvoiceStatus[] = [
  "POSTED",
  "PARTIALLY_PAID",
];

/**
 * Maps to `proc_supplier_invoice` (docs/phase-4/04-schema-operations.md §2)
 * — a supplier's invoice, 3-way-matched against `proc_purchase_order`/
 * `proc_grn` (FR-PROC-007.1). Module 12 (Procurement) **foundation pass
 * only**.
 *
 * `MutableBaseEntity` — real status progression across the full
 * UNMATCHED->...->PAID lifecycle, `paid_amount` incremented as
 * `proc_voucher_allocation` rows settle it, `match_variance` written by the
 * 3-way-match step.
 *
 * `po_id` is nullable — BR-PROC-01's "no supplier invoice posting without
 * GRN for stock items" applies to *posting*, not capture; a non-PO
 * (services/ad-hoc) invoice is a legitimate DDL shape here.
 *
 * `journal_id` is a real FK to `gl_journal` (`accounting`), nullable — only
 * set once posted (P-20), same shape `proc_grn.journal_id` has.
 * `approval_ref` is a loose `uuid`, no FK — same foundation-pass-stage
 * judgement call every other `approval_ref` column in this module makes.
 *
 * `ix_proc_inv_supplier_open` is the DDL's own partial index — BR-PROC-04's
 * "supplier payments may not exceed the open (approved, unpaid) invoice
 * balance" lookup.
 */
@Entity("proc_supplier_invoice")
@Index("uq_proc_supplier_invoice_number", ["number"], { unique: true })
@Index("ix_proc_inv_supplier_open", ["supplierId"], {
  where: `"status" IN ('POSTED','PARTIALLY_PAID')`,
})
@Check(
  "ck_proc_supplier_invoice_status",
  `"status" IN ('UNMATCHED','MATCH_EXCEPTION','MATCHED','POSTED','PAID','PARTIALLY_PAID')`,
)
@Check("ck_proc_supplier_invoice_total_positive", `"total" > 0`)
export class ProcSupplierInvoiceEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "number" })
  number!: string;

  @Column({ type: "varchar", length: 60, name: "supplier_ref" })
  supplierRef!: string;

  @Column({ type: "uuid", name: "supplier_id" })
  supplierId!: string;

  @ManyToOne(() => ProcSupplierEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "supplier_id" })
  supplier?: ProcSupplierEntity;

  @Column({ type: "uuid", name: "po_id", nullable: true })
  poId!: string | null;

  @ManyToOne(() => ProcPurchaseOrderEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "po_id" })
  po?: ProcPurchaseOrderEntity | null;

  @Column({ type: "date", name: "invoice_date" })
  invoiceDate!: string;

  @Column({ type: "date", name: "due_date" })
  dueDate!: string;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "total",
    transformer: RequiredMoneyTransformer,
  })
  total!: Money;

  @Column({ type: "varchar", length: 15, name: "status" })
  status!: ProcSupplierInvoiceStatus;

  @Column({ type: "jsonb", name: "match_variance", nullable: true })
  matchVariance!: Record<string, unknown> | null;

  /** Loose uuid, no FK — see class doc comment. */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;

  @Column({ type: "uuid", name: "journal_id", nullable: true })
  journalId!: string | null;

  @ManyToOne(() => GlJournalEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "journal_id" })
  journal?: GlJournalEntity | null;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "paid_amount",
    default: 0,
    transformer: RequiredMoneyTransformer,
  })
  paidAmount!: Money;
}

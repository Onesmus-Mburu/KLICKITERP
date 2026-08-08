import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { ProcGrnEntity } from "./proc-grn.entity";
import { ProcPoLineEntity } from "./proc-po-line.entity";

/**
 * Maps to `proc_grn_line` (docs/phase-4/04-schema-operations.md §2) — one
 * received line of a `proc_grn`, against a specific `proc_po_line`. Module
 * 12 (Procurement) **foundation pass only**.
 *
 * **Base-class judgement call**: `MutableBaseEntity` — the parent `proc_grn`
 * carries a real `DRAFT` status (CK `DRAFT|POSTED`), so a receiving clerk
 * can capture/correct received/rejected quantities and rejection reasons
 * while the GRN sits in `DRAFT`, before posting — the same "freely edited
 * while parent is DRAFT" shape `bill_invoice_line`/`proc_requisition_line`
 * established, not `pay_receipt_split`'s no-DRAFT divergence.
 *
 * `trg_proc_grn_qty_cap` (migration `0100`, BR-PROC-03) is a `BEFORE INSERT
 * OR UPDATE` trigger on this table — computes `SUM(received_qty)` across all
 * GRN lines for the same `po_line_id` (including the new/updated row) and
 * rejects if it exceeds that PO line's `qty` plus a **hard-coded 5%
 * tolerance ceiling** (defense-in-depth backstop; the real *configurable*
 * tolerance percentage, read from Settings, belongs in the next pass's
 * GRN-posting service — the DB trigger is the non-configurable hard ceiling
 * only, never the primary enforcement point).
 */
@Entity("proc_grn_line")
@Check("ck_proc_grn_line_received_qty_positive", `"received_qty" > 0`)
@Check("ck_proc_grn_line_rejected_qty_nonneg", `"rejected_qty" >= 0`)
@Check("ck_proc_grn_line_unit_cost_nonneg", `"unit_cost" >= 0`)
export class ProcGrnLineEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "grn_id" })
  grnId!: string;

  @ManyToOne(() => ProcGrnEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "grn_id" })
  grn?: ProcGrnEntity;

  @Column({ type: "uuid", name: "po_line_id" })
  poLineId!: string;

  @ManyToOne(() => ProcPoLineEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "po_line_id" })
  poLine?: ProcPoLineEntity;

  /** Physical quantity, not currency — no Money transformer. See `proc-po-line.entity.ts`'s doc comment. */
  @Column({ type: "numeric", precision: 14, scale: 4, name: "received_qty" })
  receivedQty!: string;

  @Column({ type: "numeric", precision: 14, scale: 4, name: "rejected_qty", default: 0 })
  rejectedQty!: string;

  @Column({ type: "text", name: "rejection_reason", nullable: true })
  rejectionReason!: string | null;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "unit_cost",
    transformer: RequiredMoneyTransformer,
  })
  unitCost!: Money;
}

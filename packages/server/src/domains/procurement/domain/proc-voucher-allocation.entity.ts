import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { ProcPaymentVoucherEntity } from "./proc-payment-voucher.entity";
import { ProcSupplierInvoiceEntity } from "./proc-supplier-invoice.entity";

/**
 * Maps to `proc_voucher_allocation` (docs/phase-4/04-schema-operations.md
 * §2) — one supplier-invoice allocation of a `proc_payment_voucher`. Module
 * 12 (Procurement) **foundation pass only**.
 *
 * **Base-class judgement call**: `MutableBaseEntity` — the parent
 * `proc_payment_voucher` carries a real `DRAFT` status (CK includes
 * `DRAFT`), so allocations are attached/adjusted while the voucher sits in
 * `DRAFT`, before submission — the same "freely edited while parent is
 * DRAFT" shape `bill_invoice_line`/`proc_requisition_line`/
 * `proc_grn_line` established, not `pay_receipt_allocation`'s no-DRAFT
 * divergence (its parent `pay_receipt` has no `DRAFT` status at all).
 *
 * `trg_proc_voucher_allocation_sum` (migration `0100`) is a `DEFERRABLE
 * INITIALLY DEFERRED` constraint trigger asserting `SUM(amount)` for the
 * affected `voucher_id` equals that voucher's `total` at COMMIT — the exact
 * deferred-aggregate pattern `trg_pay_splits_sum`/`trg_bill_installments_sum`
 * established. This enforces only the "allocations sum to the voucher
 * total" half of BR-PROC-04; the "allocation <= invoice open balance" half
 * is a cross-row runtime check needing `proc_supplier_invoice.paid_amount`
 * at the moment of allocation, deliberately left to the next pass's SERVICE
 * layer (documented in migration `0100`'s own doc comment).
 */
@Entity("proc_voucher_allocation")
@Check("ck_proc_voucher_allocation_amount_positive", `"amount" > 0`)
export class ProcVoucherAllocationEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "voucher_id" })
  voucherId!: string;

  @ManyToOne(() => ProcPaymentVoucherEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "voucher_id" })
  voucher?: ProcPaymentVoucherEntity;

  @Column({ type: "uuid", name: "supplier_invoice_id" })
  supplierInvoiceId!: string;

  @ManyToOne(() => ProcSupplierInvoiceEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "supplier_invoice_id" })
  supplierInvoice?: ProcSupplierInvoiceEntity;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    transformer: RequiredMoneyTransformer,
  })
  amount!: Money;
}

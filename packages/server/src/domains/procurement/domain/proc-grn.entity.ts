import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { GlJournalEntity } from "../../../accounting";
import { UsrUserEntity } from "../../../platform/users";
import { ProcPurchaseOrderEntity } from "./proc-purchase-order.entity";

export type ProcGrnStatus = "DRAFT" | "POSTED";
export const PROC_GRN_STATUSES: readonly ProcGrnStatus[] = ["DRAFT", "POSTED"];

/**
 * Maps to `proc_grn` (docs/phase-4/04-schema-operations.md §2) — a goods
 * received note against an ISSUED `proc_purchase_order`. Module 12
 * (Procurement) **foundation pass only**.
 *
 * `MutableBaseEntity` — real post-creation update path: `status`
 * DRAFT->POSTED, `journal_id` written only at posting time (P-18, per
 * FR-PROC-006.1's "stock lines post P-18 at PO price").
 *
 * `journal_id` is a real FK to `gl_journal` (`accounting`, via its public
 * barrel), nullable — only set once posted (mirrors `bill_invoice.
 * journal_id`'s nullable-until-posted shape, not `pay_receipt.journal_id`'s
 * NOT NULL "always posted atomically" shape, since a GRN genuinely starts
 * `DRAFT` with no journal yet per BR-PROC-01's "no GRN without issued PO"
 * chain still allowing a receiving clerk to capture quantities before the
 * accounting posting step runs).
 */
@Entity("proc_grn")
@Index("uq_proc_grn_number", ["number"], { unique: true })
@Check("ck_proc_grn_status", `"status" IN ('DRAFT','POSTED')`)
export class ProcGrnEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "number" })
  number!: string;

  @Column({ type: "uuid", name: "po_id" })
  poId!: string;

  @ManyToOne(() => ProcPurchaseOrderEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "po_id" })
  po?: ProcPurchaseOrderEntity;

  @Column({ type: "uuid", name: "received_by" })
  receivedBy!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "received_by" })
  receiver?: UsrUserEntity;

  @Column({ type: "timestamptz", name: "received_at" })
  receivedAt!: Date;

  @Column({ type: "varchar", length: 12, name: "status" })
  status!: ProcGrnStatus;

  @Column({ type: "uuid", name: "journal_id", nullable: true })
  journalId!: string | null;

  @ManyToOne(() => GlJournalEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "journal_id" })
  journal?: GlJournalEntity | null;

  @Column({ type: "text", name: "notes", nullable: true })
  notes!: string | null;
}

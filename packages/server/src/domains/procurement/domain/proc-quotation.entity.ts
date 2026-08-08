import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { FileObjectEntity } from "../../../platform/files";
import { ProcRequisitionEntity } from "./proc-requisition.entity";
import { ProcSupplierEntity } from "./proc-supplier.entity";

/**
 * Maps to `proc_quotation` (docs/phase-4/04-schema-operations.md §2) — a
 * supplier's quotation against a `proc_requisition`. Module 12 (Procurement)
 * **foundation pass only**.
 *
 * `MutableBaseEntity` — a real post-creation update path: `is_awarded`
 * starts `false` and flips `true` exactly once at award time
 * (FR-PROC-011.1's quotation comparison), with `award_reason` written then.
 *
 * `document_file_id` is a real FK to `file_object` (`platform/files`, via its
 * public barrel), nullable `SET NULL`.
 *
 * `terms` is treated as nullable — a documented judgement call: the DDL
 * lists `terms text` with no explicit `NULL` marker, but a captured quote
 * need not carry special terms, so this pass treats it as optional (parallel
 * to how `proc_requisition.budget_snapshot` was also judged nullable against
 * a literal "no marker = NOT NULL" reading, for a similarly concrete
 * business reason).
 *
 * `uq_proc_quotation_award_p` (`WHERE is_awarded`) is the DDL's own
 * `uq_award_p (requisition_id) WHERE is_awarded` — at most one awarded
 * quotation per requisition.
 */
@Entity("proc_quotation")
@Index("uq_proc_quotation_award_p", ["requisitionId"], { unique: true, where: `"is_awarded" = true` })
export class ProcQuotationEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "requisition_id" })
  requisitionId!: string;

  @ManyToOne(() => ProcRequisitionEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "requisition_id" })
  requisition?: ProcRequisitionEntity;

  @Column({ type: "uuid", name: "supplier_id" })
  supplierId!: string;

  @ManyToOne(() => ProcSupplierEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "supplier_id" })
  supplier?: ProcSupplierEntity;

  @Column({ type: "date", name: "quote_date" })
  quoteDate!: string;

  @Column({ type: "date", name: "valid_until", nullable: true })
  validUntil!: string | null;

  @Column({ type: "uuid", name: "document_file_id", nullable: true })
  documentFileId!: string | null;

  @ManyToOne(() => FileObjectEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "document_file_id" })
  documentFile?: FileObjectEntity | null;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "total",
    transformer: RequiredMoneyTransformer,
  })
  total!: Money;

  /** Nullable — see class doc comment. */
  @Column({ type: "text", name: "terms", nullable: true })
  terms!: string | null;

  @Column({ type: "boolean", name: "is_awarded", default: false })
  isAwarded!: boolean;

  @Column({ type: "text", name: "award_reason", nullable: true })
  awardReason!: string | null;
}

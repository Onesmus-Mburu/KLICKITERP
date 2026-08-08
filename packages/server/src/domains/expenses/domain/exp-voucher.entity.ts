import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { GlCostCenterEntity, GlJournalEntity } from "../../../accounting";
import { ExpCategoryEntity } from "./exp-category.entity";

export type ExpVoucherPayeeType = "SUPPLIER" | "STAFF" | "OTHER";
export const EXP_VOUCHER_PAYEE_TYPES: readonly ExpVoucherPayeeType[] = ["SUPPLIER", "STAFF", "OTHER"];

export type ExpVoucherMethod = "CASH" | "BANK" | "PETTY_CASH" | "MPESA" | "CHEQUE";
export const EXP_VOUCHER_METHODS: readonly ExpVoucherMethod[] = ["CASH", "BANK", "PETTY_CASH", "MPESA", "CHEQUE"];

export type ExpVoucherStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PAID" | "CANCELLED";
export const EXP_VOUCHER_STATUSES: readonly ExpVoucherStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "PAID",
  "CANCELLED",
];

/**
 * Maps to `exp_voucher` (docs/phase-4/04-schema-operations.md §4) — the
 * general expense voucher (FR-EXP-002.1, posting P-25). Module 14 (Expenses)
 * **foundation pass only**.
 *
 * `MutableBaseEntity` — real status progression across the full
 * DRAFT->PENDING_APPROVAL->APPROVED->PAID/CANCELLED lifecycle
 * (`ProcPaymentVoucherEntity`'s exact shape), `journal_id` written only at
 * posting.
 *
 * `payee_ref` (jsonb) carries the actual payee identity, shaped differently
 * per `payee_type` (e.g. `{supplierId}` for SUPPLIER, `{staffUserId}` for
 * STAFF, `{name, contact}` for OTHER) — a polymorphic reference cannot carry
 * a single real FK, so it stays opaque jsonb from this entity's point of
 * view, the same "opaque jsonb, structure documented at the service layer"
 * convention `BrndThemeEntity.tokens`/`InvItemEntity.uomConversions`
 * establish. `SUPPLIER` payees deliberately do NOT get a real
 * `proc_supplier` FK here — `domains/procurement` is not in this module's
 * `mayImport` list (expenses and procurement are siblings, no legitimate
 * coupling), so cross-checking a `payee_ref.supplierId` against
 * `proc_supplier` is a service-layer concern for the next pass, if ever
 * added.
 *
 * `cost_center_id` is a nullable FK to `gl_cost_center` (`accounting`) — the
 * DDL's own "`cost_center_id NULL`", not every expense needs a cost-center
 * tag.
 *
 * `approval_ref` stays a loose `uuid` with no FK — this module's `mayImport`
 * DOES include `platform/approvals` (unlike Inventory/Procurement's
 * foundation passes), but no entity anywhere in this codebase ever takes a
 * real FK to `appr_instance` (approval instances are looked up by id via
 * `ApprovalEngineService.getStatus()`, never joined), so this stays
 * consistent with `ProcPaymentVoucherEntity.approvalRef`/
 * `InvStockTakeEntity.approvalRef`'s precedent — ready for the next pass's
 * service to call `ApprovalEngineService.submit()` directly.
 *
 * `journal_id` is a nullable FK to `gl_journal` (`accounting`), populated
 * only once P-25 posts.
 *
 * BR-EXP-03's attachment-count requirement (≥1 `file_object` row above the
 * configured KES threshold) is explicitly a service-layer concern (per the
 * DDL's own "Note: attachment requirement (BR-EXP-03) via svc + count check
 * against file_object") — no DB constraint can count sibling `file_object`
 * rows tagged to this voucher, so nothing is enforced here.
 */
@Entity("exp_voucher")
@Index("uq_exp_voucher_number", ["number"], { unique: true })
@Check("ck_exp_voucher_payee_type", `"payee_type" IN ('SUPPLIER','STAFF','OTHER')`)
@Check("ck_exp_voucher_method", `"method" IN ('CASH','BANK','PETTY_CASH','MPESA','CHEQUE')`)
@Check(
  "ck_exp_voucher_status",
  `"status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','PAID','CANCELLED')`,
)
@Check("ck_exp_voucher_amount_positive", `"amount" > 0`)
export class ExpVoucherEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "number" })
  number!: string;

  @Column({ type: "varchar", length: 10, name: "payee_type" })
  payeeType!: ExpVoucherPayeeType;

  /** Polymorphic payee identity, shape depends on payee_type — see class doc comment. */
  @Column({ type: "jsonb", name: "payee_ref" })
  payeeRef!: Record<string, unknown>;

  @Column({ type: "uuid", name: "category_id" })
  categoryId!: string;

  @ManyToOne(() => ExpCategoryEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "category_id" })
  category?: ExpCategoryEntity;

  @Column({ type: "uuid", name: "cost_center_id", nullable: true })
  costCenterId!: string | null;

  @ManyToOne(() => GlCostCenterEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "cost_center_id" })
  costCenter?: GlCostCenterEntity | null;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    transformer: RequiredMoneyTransformer,
  })
  amount!: Money;

  @Column({ type: "varchar", length: 10, name: "method" })
  method!: ExpVoucherMethod;

  @Column({ type: "text", name: "narrative" })
  narrative!: string;

  @Column({ type: "varchar", length: 15, name: "status" })
  status!: ExpVoucherStatus;

  /** Loose uuid, no FK — see class doc comment. */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;

  @Column({ type: "uuid", name: "journal_id", nullable: true })
  journalId!: string | null;

  @ManyToOne(() => GlJournalEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "journal_id" })
  journal?: GlJournalEntity | null;
}

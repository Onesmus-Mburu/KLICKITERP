import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { GlBudgetLineEntity } from "../../../accounting";
// Imported directly from its entity file, not `domains/inventory`'s barrel —
// same circular-require-avoidance discipline every other cross-domain entity
// FK in this codebase follows (see `WallWalletEntity`'s import comment in
// `domains/wallet/domain/wall-wallet.entity.ts`).
import { InvItemEntity } from "../../inventory/domain/inv-item.entity";
import { ProcRequisitionEntity } from "./proc-requisition.entity";

/**
 * Maps to `proc_requisition_line` (docs/phase-4/04-schema-operations.md §2)
 * — one line of a `proc_requisition`, either an inventory item or a
 * free-text description. Module 12 (Procurement) **foundation pass only**.
 *
 * **Base-class judgement call**: `MutableBaseEntity` — `proc_requisition`
 * carries a real `DRAFT` status (unlike `pay_receipt`'s no-DRAFT shape), and
 * lines are freely added/edited/removed while the parent sits in `DRAFT`
 * before submission — the same "freely edited while parent is DRAFT" shape
 * `bill_invoice_line` (also `MutableBaseEntity`) established, not
 * `pay_receipt_split`'s "no pre-existing row to ever legitimately edit"
 * divergence.
 *
 * `item_id` is a real, nullable FK to `inv_item` (Module 13/Inventory) — the
 * forward-reference gap this codebase's convention created (e.g.
 * `std_student.sponsor_id` before Module 9 closed that gap) is now closed by
 * migration `0111` (`AddProcurementItemFks0111`), which added the FK
 * constraint once `inv_item` existed; `InvItemEntity` is imported directly
 * from its entity file, never through `domains/inventory`'s barrel (see the
 * import comment above). `free_text` is the free-text alternative when no
 * `item_id` is set — the
 * `ck_proc_requisition_line_item_or_free_text` CHECK enforces at least one
 * is present, a defensive constraint the DDL implies but doesn't spell out.
 *
 * `budget_line_id` is a real FK to `gl_budget_line` (`accounting`, imported
 * via its public barrel).
 */
@Entity("proc_requisition_line")
@Check("ck_proc_requisition_line_qty_positive", `"qty" > 0`)
@Check("ck_proc_requisition_line_est_price_nonneg", `"est_price" >= 0`)
@Check(
  "ck_proc_requisition_line_item_or_free_text",
  `"item_id" IS NOT NULL OR "free_text" IS NOT NULL`,
)
export class ProcRequisitionLineEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "requisition_id" })
  requisitionId!: string;

  @ManyToOne(() => ProcRequisitionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "requisition_id" })
  requisition?: ProcRequisitionEntity;

  /** Real FK to `inv_item` (Module 13/Inventory), added by migration `0111`. See class doc comment. */
  @Column({ type: "uuid", name: "item_id", nullable: true })
  itemId!: string | null;

  @ManyToOne(() => InvItemEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "item_id" })
  item?: InvItemEntity | null;

  @Column({ type: "text", name: "free_text", nullable: true })
  freeText!: string | null;

  /** Physical quantity, not currency — no Money transformer. See `proc-po-line.entity.ts`'s doc comment for the codebase-wide reasoning. */
  @Column({ type: "numeric", precision: 14, scale: 4, name: "qty" })
  qty!: string;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "est_price",
    transformer: RequiredMoneyTransformer,
  })
  estPrice!: Money;

  @Column({ type: "uuid", name: "budget_line_id", nullable: true })
  budgetLineId!: string | null;

  @ManyToOne(() => GlBudgetLineEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "budget_line_id" })
  budgetLine?: GlBudgetLineEntity | null;
}

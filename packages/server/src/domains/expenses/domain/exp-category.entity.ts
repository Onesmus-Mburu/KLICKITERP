import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { GlAccountEntity } from "../../../accounting";

/**
 * Maps to `exp_category` (docs/phase-4/04-schema-operations.md §4) — a
 * hierarchical expense category (self-referencing `parent_id`), the
 * classification every `exp_voucher`/`exp_petty_cash_voucher`/
 * `exp_claim_line` must map to (BR-EXP-01). Module 14 (Expenses)
 * **foundation pass only** (docs/phase-5/PROGRESS.md): entities/
 * repositories/migration/triggers. Application services (voucher
 * submission/approval/posting, petty cash spend/replenishment, staff claims,
 * recurring templates, controllers, tests, seed) land in a later pass.
 *
 * `MutableBaseEntity` — genuine post-creation editing: a category's `name`
 * can be renamed, `parent_id` re-parented, and `budget_required`/`is_active`
 * toggled as the chart of expense categories is maintained over time, the
 * exact same shape `InvCategoryEntity` established for this codebase.
 *
 * `parent_id` is a nullable self-FK (`ON DELETE RESTRICT` — same
 * "self-reference stays restrict" choice `InvCategoryEntity.parentId`/
 * `proc_purchase_order.supersedes_id` made — a category with children cannot
 * be deleted out from under them).
 *
 * `gl_expense_account_id` is a required FK to `gl_account` (`accounting`,
 * imported via its barrel — a plain entity target, no sibling-domain
 * circular-require concern) — BR-EXP-01's "every expense maps to a category
 * with a GL account" half, enforced structurally at category-definition time
 * so every voucher/claim-line that resolves its category automatically
 * inherits a valid posting account. `budget_required` is BR-EXP-01's other
 * half (a budget-line check) — a plain boolean flag here; the actual
 * budget-availability check against `gl_budget_line` is a service-layer
 * concern for the next pass (mirrors how `proc_requisition.budget_snapshot`
 * defers the real check to its own service).
 */
@Entity("exp_category")
@Index("uq_exp_category_name", ["name"], { unique: true })
export class ExpCategoryEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 120, name: "name" })
  name!: string;

  @Column({ type: "uuid", name: "parent_id", nullable: true })
  parentId!: string | null;

  @ManyToOne(() => ExpCategoryEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "parent_id" })
  parent?: ExpCategoryEntity | null;

  @Column({ type: "uuid", name: "gl_expense_account_id" })
  glExpenseAccountId!: string;

  @ManyToOne(() => GlAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "gl_expense_account_id" })
  glExpenseAccount?: GlAccountEntity;

  @Column({ type: "boolean", name: "budget_required", default: false })
  budgetRequired!: boolean;

  @Column({ type: "boolean", name: "is_active", default: true })
  isActive!: boolean;
}

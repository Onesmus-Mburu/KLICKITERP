import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../shared/database/mutable-base.entity";
import { Money } from "../../shared/money/money";
import { RequiredMoneyTransformer } from "../../shared/money/money.transformer";
import { GlAccountEntity } from "./gl-account.entity";
import { GlBudgetEntity } from "./gl-budget.entity";
import { GlCostCenterEntity } from "./gl-cost-center.entity";

/**
 * Maps to `gl_budget_line` (docs/phase-4/02-schema-platform-accounting.md
 * §8). `MutableBaseEntity` — a documented judgement call (task brief leaves
 * this one to the builder's discretion): budget lines are freely edited
 * (amount/phasing revisions) while their parent `gl_budget` sits in
 * `DRAFT`, the same "config row edited pre-activation" shape as
 * `appr_level`/`appr_routing_rule` (also `MutableBaseEntity`, also
 * CASCADE-deleted with their parent). `budget_id` FKs `ON DELETE CASCADE`
 * per the DDL's explicit annotation — a budget line has no existence
 * independent of its budget.
 *
 * `period_phasing` (jsonb) is the annual amount's month-by-month/term-by-
 * term spread — opaque to this pass, interpreted by the next pass's budget
 * application service.
 */
@Entity("gl_budget_line")
@Index("uq_gl_budget_line_budget_account_cc", ["budgetId", "accountId", "costCenterId"], { unique: true })
export class GlBudgetLineEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "budget_id" })
  budgetId!: string;

  @ManyToOne(() => GlBudgetEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "budget_id" })
  budget?: GlBudgetEntity;

  @Column({ type: "uuid", name: "account_id" })
  accountId!: string;

  @ManyToOne(() => GlAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "account_id" })
  account?: GlAccountEntity;

  @Column({ type: "uuid", name: "cost_center_id", nullable: true })
  costCenterId!: string | null;

  @ManyToOne(() => GlCostCenterEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "cost_center_id" })
  costCenter?: GlCostCenterEntity | null;

  @Column({ type: "jsonb", name: "period_phasing" })
  periodPhasing!: Record<string, unknown>;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "annual_amount",
    transformer: RequiredMoneyTransformer,
  })
  annualAmount!: Money;
}

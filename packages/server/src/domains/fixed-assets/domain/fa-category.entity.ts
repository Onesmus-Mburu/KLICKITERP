import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { GlAccountEntity } from "../../../accounting";

export type FaCategoryMethod = "SL" | "RB";
export const FA_CATEGORY_METHODS: readonly FaCategoryMethod[] = ["SL", "RB"];

/**
 * Maps to `fa_category` (docs/phase-4/04-schema-operations.md §5) — the
 * depreciation policy bucket every `fa_asset` belongs to (straight-line vs
 * reducing-balance, life, residual %, and the 3 GL account mappings the
 * next pass's monthly depreciation run posts against). Module 17 (Fixed
 * Assets) **foundation pass only** (docs/phase-5/PROGRESS.md): entities/
 * repositories/migration/triggers. Application services (asset register,
 * monthly depreciation-run engine, disposal wizard, transfers, maintenance,
 * physical verification, controllers, tests, seed) land in a later pass.
 *
 * `MutableBaseEntity` — a config entity with genuine post-creation editing
 * (policy tweaks, GL remapping), the same class every other config entity
 * this module-size uses (`gl_account`/`inv_category`/`exp_category`/
 * `bank_account`).
 *
 * `rate` (`NUMERIC(9,6)`, nullable) is the RB-method annual rate — needed
 * only when `method='RB'` (`SL` derives its own periodic charge from
 * `cost`/`residual_value`/`life_months` instead, no rate required). The DDL
 * does not spell out a CHECK enforcing this cross-column dependency (unlike
 * `inv_item`'s explicit BR-INV-04 CHECK), so it stays a service-layer
 * concern for the next pass's depreciation-run engine, not a DB constraint
 * here. Deliberately NOT routed through `MoneyTransformer` — it is a rate,
 * not a currency amount, the same treatment `pyrl_loan.rate` established
 * for this codebase's other `NUMERIC(9,6)` rate columns (raw decimal
 * string, no float, no premature rounding).
 *
 * `residual_pct` (`NUMERIC(5,4)`, default 0) is a fraction (e.g. `0.1000` =
 * 10%), not currency either — same non-Money raw-decimal-string treatment.
 *
 * **GL trio**: `gl_cost_account_id`/`gl_accum_dep_account_id`/
 * `gl_dep_expense_account_id` are all required FKs to `gl_account`
 * (`accounting`, imported via its `index.ts` barrel only) — the DDL's own
 * "gl mappings (cost, accum_dep, dep_expense)" shorthand realized as 3 real
 * FK columns, per this pass's own explicit instruction.
 */
@Entity("fa_category")
@Index("uq_fa_category_name", ["name"], { unique: true })
@Check("ck_fa_category_method", `"method" IN ('SL','RB')`)
export class FaCategoryEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 120, name: "name" })
  name!: string;

  @Column({ type: "varchar", length: 2, name: "method" })
  method!: FaCategoryMethod;

  @Column({ type: "int", name: "life_months" })
  lifeMonths!: number;

  /** RB rate — see class doc comment. Raw decimal string, deliberately NOT MoneyTransformer. */
  @Column({ type: "numeric", precision: 9, scale: 6, name: "rate", nullable: true })
  rate!: string | null;

  /** Fraction (e.g. 0.1000 = 10%) — see class doc comment. Raw decimal string, deliberately NOT MoneyTransformer. */
  @Column({ type: "numeric", precision: 5, scale: 4, name: "residual_pct", default: 0 })
  residualPct!: string;

  @Column({ type: "uuid", name: "gl_cost_account_id" })
  glCostAccountId!: string;

  @ManyToOne(() => GlAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "gl_cost_account_id" })
  glCostAccount?: GlAccountEntity;

  @Column({ type: "uuid", name: "gl_accum_dep_account_id" })
  glAccumDepAccountId!: string;

  @ManyToOne(() => GlAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "gl_accum_dep_account_id" })
  glAccumDepAccount?: GlAccountEntity;

  @Column({ type: "uuid", name: "gl_dep_expense_account_id" })
  glDepExpenseAccountId!: string;

  @ManyToOne(() => GlAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "gl_dep_expense_account_id" })
  glDepExpenseAccount?: GlAccountEntity;
}

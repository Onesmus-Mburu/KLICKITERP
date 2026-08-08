import { Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../shared/database/mutable-base.entity";

/**
 * Maps to `gl_cost_center` (docs/phase-4/02-schema-platform-accounting.md
 * §8) — the dimension `gl_journal_line`/`gl_period_account_total`/
 * `gl_budget_line` optionally tag. `MutableBaseEntity` — ordinary mutable
 * config (rename, activate/deactivate), same class as `gl_account`.
 */
@Entity("gl_cost_center")
@Index("uq_gl_cost_center_code", ["code"], { unique: true })
export class GlCostCenterEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 20, name: "code" })
  code!: string;

  @Column({ type: "varchar", length: 80, name: "name" })
  name!: string;

  @Column({ type: "boolean", name: "is_active", default: true })
  isActive!: boolean;
}

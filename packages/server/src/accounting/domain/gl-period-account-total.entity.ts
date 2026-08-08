import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../shared/database/base.entity";
import { Money } from "../../shared/money/money";
import { RequiredMoneyTransformer } from "../../shared/money/money.transformer";
import { GlAccountEntity } from "./gl-account.entity";
import { GlCostCenterEntity } from "./gl-cost-center.entity";
import { GlPeriodEntity } from "./gl-period.entity";

/**
 * Maps to `gl_period_account_total` (docs/phase-4/02-schema-platform-accounting.md
 * §8) — the N-6 denormalization (`docs/phase-4/01-standards-and-migrations.md`
 * §4): `gl_account.current_balance` is deliberately **not stored**; this
 * table is the maintained-aggregate substitute, written exclusively by the
 * (not-yet-built) `PostingService` inside the same transaction as the
 * journal it aggregates, and re-derived/verified by an hourly integrity
 * sweep (`gl_integrity_run`, NFR-INT-002) against `SUM(gl_journal_line)`.
 *
 * `BaseEntity` (not `MutableBaseEntity`) — this row is only ever
 * incremented in place by the posting service under `trg_gl_writer_guard`'s
 * `application_name` gate (migration `0060`), never edited via a general
 * app-facing update path with optimistic locking; same "posting-service-
 * maintained aggregate, not directly user-mutable" treatment the task brief
 * calls for.
 */
@Entity("gl_period_account_total")
@Index("uq_gl_period_account_total_period_account_cc", ["periodId", "accountId", "costCenterId"], {
  unique: true,
})
export class GlPeriodAccountTotalEntity extends BaseEntity {
  @Column({ type: "uuid", name: "period_id" })
  periodId!: string;

  @ManyToOne(() => GlPeriodEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "period_id" })
  period?: GlPeriodEntity;

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

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "debit_total",
    transformer: RequiredMoneyTransformer,
  })
  debitTotal!: Money;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "credit_total",
    transformer: RequiredMoneyTransformer,
  })
  creditTotal!: Money;
}

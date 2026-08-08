import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { ExpVoucherEntity } from "./exp-voucher.entity";

/**
 * Maps to `exp_recurring` (docs/phase-4/04-schema-operations.md §4) — a
 * recurring expense template (e.g. monthly rent, a subscription) that the
 * next pass's "run now" flow materializes into a real `exp_voucher`. Module
 * 14 (Expenses) **foundation pass only**.
 *
 * `MutableBaseEntity` — genuine post-creation editing: a recurring
 * template's `template` payload/`schedule_cron`/`next_run_on` get edited as
 * the recurring arrangement changes, and `next_run_on`/`last_voucher_id` are
 * advanced every time the template fires — the exact "config record with a
 * running cursor" shape `SetNumberingSeriesEntity`'s own next-value counter
 * established.
 *
 * `template` (jsonb) is an opaque payload from this entity's point of view —
 * the shape of a to-be-materialized `exp_voucher` (payee_type/payee_ref/
 * category_id/cost_center_id/amount/method/narrative, everything
 * `ExpVoucherEntity` needs minus the fields only assignable at
 * materialization time: number/status/approval_ref/journal_id) — documented
 * at the service layer that reads it in the next pass, same "opaque jsonb"
 * convention `BrndThemeEntity.tokens`/`ExpVoucherEntity.payeeRef` establish.
 *
 * `schedule_cron varchar(30)` stores a cron expression, but **real cron
 * scheduling is explicitly out of scope for this codebase** (no worker/
 * scheduler process exists anywhere yet, per `docs/phase-5/PROGRESS.md`'s
 * environment status) — the column is schema-ready per the DDL, but
 * `next_run_on` (a plain `date`) is what the next pass's manual "run due
 * templates now" endpoint actually queries via
 * `ExpRecurringRepository.findDueForRun(asOfDate)` (this pass), not a cron
 * parse. `last_voucher_id` is a nullable FK to `exp_voucher` (`ON DELETE
 * RESTRICT` — a fired template's history shouldn't vanish if the voucher it
 * produced is somehow removed), populated only after the first successful
 * run.
 */
@Entity("exp_recurring")
export class ExpRecurringEntity extends MutableBaseEntity {
  /** Opaque to-be-materialized exp_voucher payload — see class doc comment. */
  @Column({ type: "jsonb", name: "template" })
  template!: Record<string, unknown>;

  @Column({ type: "varchar", length: 30, name: "schedule_cron" })
  scheduleCron!: string;

  @Column({ type: "date", name: "next_run_on" })
  nextRunOn!: string;

  @Column({ type: "uuid", name: "last_voucher_id", nullable: true })
  lastVoucherId!: string | null;

  @ManyToOne(() => ExpVoucherEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "last_voucher_id" })
  lastVoucher?: ExpVoucherEntity | null;

  @Column({ type: "boolean", name: "is_active", default: true })
  isActive!: boolean;
}

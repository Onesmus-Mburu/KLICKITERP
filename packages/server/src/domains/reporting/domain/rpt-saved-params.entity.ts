import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { UsrUserEntity } from "../../../platform/users";

/**
 * Maps to `rpt_saved_params` (docs/phase-4/04-schema-operations.md §6) — a
 * user's named, reusable filter/parameter set for a given report (e.g. "My
 * Term 2 Class 4 Fee Statement"). Module 18 (Reporting Engine + Dashboard)
 * **foundation pass only** (docs/phase-5/PROGRESS.md): this table plus
 * `rpt_schedule`/`rpt_export_job`, the 5 materialized views, and read-access
 * scaffolding. The actual report catalogue, Dashboard KPI service, and the
 * controllers that let a user create/apply one of these rows land in a later
 * pass.
 *
 * `MutableBaseEntity` — genuine post-creation edits: a user renames or
 * re-tunes a saved parameter set's `params` jsonb after creating it.
 *
 * `report_code` is a bare `varchar(40)` with no CHECK/FK — the report
 * catalogue (which reports exist, what codes they use) is a next-pass
 * concern; this table only needs to be able to reference a code, not
 * validate it exists yet.
 *
 * `params` is opaque `jsonb` — its shape is entirely report-specific (date
 * ranges, class/term filters, etc.), decided per-report by the next pass's
 * report registry, same "opaque jsonb, structure documented at the service
 * layer" convention `ExpVoucherEntity.payeeRef`/`InvItemEntity.uomConversions`
 * establish.
 *
 * `uq_rpt_saved_params_user_report_name` (judgement call, not spelled out in
 * the DDL): a user should not be able to save two parameter sets with the
 * same display `name` under the same `report_code` — mirrors the
 * "named, per-owner uniqueness" shape `set_numbering_series`/`brnd_theme`
 * (partial-unique) precedents establish elsewhere in this codebase, here as
 * a plain (non-partial) composite unique index since there is no
 * status/lifecycle dimension to scope it by.
 */
@Entity("rpt_saved_params")
@Index("ix_rpt_saved_params_user", ["userId"])
@Index("uq_rpt_saved_params_user_report_name", ["userId", "reportCode", "name"], { unique: true })
export class RptSavedParamsEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "user_id" })
  userId!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "user_id" })
  user?: UsrUserEntity;

  @Column({ type: "varchar", length: 40, name: "report_code" })
  reportCode!: string;

  @Column({ type: "varchar", length: 80, name: "name" })
  name!: string;

  /** Opaque, report-specific filter/parameter shape — see class doc comment. */
  @Column({ type: "jsonb", name: "params" })
  params!: Record<string, unknown>;
}

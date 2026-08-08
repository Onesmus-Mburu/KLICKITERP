import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { GlPeriodEntity, GlJournalEntity } from "../../../accounting";

export type FaDepreciationRunStatus = "DRAFT" | "PENDING_APPROVAL" | "POSTED";
export const FA_DEPRECIATION_RUN_STATUSES: readonly FaDepreciationRunStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "POSTED",
];

/**
 * Maps to `fa_depreciation_run` (docs/phase-4/04-schema-operations.md §5) —
 * one monthly depreciation batch (FR-FA-003.1: SL/RB per category policy,
 * prorated from in-service month, batch journal P-30, approval-gated
 * `DEPRECIATION`). Module 17 (Fixed Assets) **foundation pass only**.
 *
 * `MutableBaseEntity` — real status progression `DRAFT -> PENDING_APPROVAL
 * -> POSTED`, `journal_id` written only once posted.
 *
 * `period_id` is a required, UNIQUE FK to `gl_period` (`accounting`,
 * imported via its `index.ts` barrel only) — the DDL's own `UQ` marker: at
 * most one depreciation run per fiscal period, the next pass's
 * `FaDepreciationRunRepository.findByPeriodId()` lookup exists precisely to
 * check this before creating a new run.
 *
 * **`trg_fa_depreciation_run_immutable`** (migration `0150`) freezes this
 * row UNCONDITIONALLY once `status='POSTED'` — unlike `pyrl_run`'s own
 * immutability trigger (which must still allow `status` to keep progressing
 * `COMMITTED -> PAID -> FILED`), a posted depreciation run has **no further
 * legitimate status progression at all**: `POSTED` is this entity's own
 * terminal state (the DDL's 3-value enum ends there), so the trigger rejects
 * every column change, `status` included, rather than needing a
 * "status may still advance" carve-out. Corrections require a brand-new run
 * in a later period, never an edit to a posted one.
 *
 * `approval_ref` is a loose `uuid` with no FK — `platform/approvals` is
 * listed in this foundation pass's `mayImport` for parity/forward-looking
 * readiness only (same judgement call every other module this size has
 * made); no entity anywhere in this codebase ever takes a real FK to
 * `appr_instance`.
 */
@Entity("fa_depreciation_run")
@Index("uq_fa_depreciation_run_period_id", ["periodId"], { unique: true })
@Check("ck_fa_depreciation_run_status", `"status" IN ('DRAFT','PENDING_APPROVAL','POSTED')`)
export class FaDepreciationRunEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "period_id" })
  periodId!: string;

  @ManyToOne(() => GlPeriodEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "period_id" })
  period?: GlPeriodEntity;

  @Column({ type: "varchar", length: 18, name: "status" })
  status!: FaDepreciationRunStatus;

  /** Loose uuid, no FK — see class doc comment. */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;

  @Column({ type: "uuid", name: "journal_id", nullable: true })
  journalId!: string | null;

  @ManyToOne(() => GlJournalEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "journal_id" })
  journal?: GlJournalEntity | null;
}

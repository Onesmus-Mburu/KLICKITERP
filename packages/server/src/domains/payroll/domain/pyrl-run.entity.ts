import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { UsrUserEntity } from "../../../platform/users";
import { GlJournalEntity } from "../../../accounting";

export type PyrlRunKind = "MAIN" | "SUPPLEMENTARY";
export const PYRL_RUN_KINDS: readonly PyrlRunKind[] = ["MAIN", "SUPPLEMENTARY"];

export type PyrlRunStatus =
  | "DRAFT"
  | "COMPUTED"
  | "REVIEW"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "COMMITTED"
  | "PAID"
  | "FILED";
export const PYRL_RUN_STATUSES: readonly PyrlRunStatus[] = [
  "DRAFT",
  "COMPUTED",
  "REVIEW",
  "PENDING_APPROVAL",
  "APPROVED",
  "COMMITTED",
  "PAID",
  "FILED",
];

/** Statuses at/beyond which `trg_pyrl_run_immutable` (migration `0130`) freezes the figure columns (BR-PYRL-06). */
export const PYRL_RUN_COMMITTED_STATUSES: readonly PyrlRunStatus[] = ["COMMITTED", "PAID", "FILED"];

/**
 * Maps to `pyrl_run` (docs/phase-4/04-schema-operations.md §4) — one
 * payroll run (FR-PYRL-006.1's full state chain). Module 15 (Payroll)
 * **foundation pass only** (docs/phase-5/PROGRESS.md).
 *
 * `MutableBaseEntity` — real state-chain progression `DRAFT`->...->`FILED`.
 *
 * **BR-PYRL-02**: `uq_pyrl_main_run_p` is a partial unique index on
 * `period_key` `WHERE run_kind='MAIN' AND status IN ('COMMITTED','PAID','FILED')`
 * (widened by migration `0241` — the original `0130` shape only covered
 * `status='COMMITTED'`, a real live-demonstrated gap: it stopped protecting
 * a period the instant a legitimately-committed run advanced to `PAID`/
 * `FILED`, the normal expected outcome of every real run) — "a payroll
 * period can hold at most one COMMITTED-or-beyond main run; corrections use
 * supplementary runs referencing it" — mirrors `set_academic_year.
 * uq_set_year_current_p`/`brnd_theme.uq_brnd_theme_published_p`'s partial-
 * unique pattern exactly. `PyrlRunRepository.findCommittedMainForPeriod()`
 * is this invariant's read-side lookup (also widened by the same pass —
 * `createRun()` now calls it BEFORE creating a MAIN run, not just at commit
 * time, so a caller gets an immediate, clear rejection instead of walking
 * an entire run through 5 approval steps before hitting a raw DB conflict
 * at the very last one).
 *
 * **BR-PYRL-06**: "Committed payroll figures are immutable... recomputation
 * of a committed period is impossible." `trg_pyrl_run_immutable` (migration
 * `0130`) enforces this at the DB layer once `status` has EVER reached
 * `COMMITTED` or beyond (`PYRL_RUN_COMMITTED_STATUSES`): freezes `totals`/
 * `period_key`/`run_kind`/`journal_id`, but deliberately ALLOWS `status`/
 * `committed_at`/`approved_by`/`version` to keep progressing — a committed
 * run still needs to move to `PAID`/`FILED` (FR-PYRL-006.1), it just can't
 * have its FIGURES changed. Scoped to exactly those 4 named columns, the
 * same minimal-explicit-column-list style `trg_proc_po_immutable`/
 * `trg_bill_invoice_immutable` established, narrower than a blanket freeze.
 *
 * `supplements_run_id` is a self-referencing FK (a `SUPPLEMENTARY` run
 * points back at the `MAIN` run it corrects) — RESTRICT.
 *
 * `initiated_by`/`approved_by` are FKs to `usr_user` — RESTRICT.
 * `journal_id` is a nullable FK to `gl_journal` — RESTRICT, populated only
 * once the run's postings are made (a later pass's concern).
 *
 * `totals`/`variance_report` are opaque jsonb — `totals` defaults to `{}`
 * (required, no `NULL` marker in the DDL, but a `DRAFT` run has nothing
 * computed yet); `variance_report` is nullable (only populated once the
 * run reaches `REVIEW`, per FR-PYRL-006.1's "variance report vs prior
 * run").
 */
@Entity("pyrl_run")
@Index("uq_pyrl_main_run_p", ["periodKey"], {
  unique: true,
  where: `"run_kind" = 'MAIN' AND "status" IN ('COMMITTED', 'PAID', 'FILED')`,
})
@Check("ck_pyrl_run_kind", `"run_kind" IN ('MAIN','SUPPLEMENTARY')`)
@Check(
  "ck_pyrl_run_status",
  `"status" IN ('DRAFT','COMPUTED','REVIEW','PENDING_APPROVAL','APPROVED','COMMITTED','PAID','FILED')`,
)
export class PyrlRunEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 7, name: "period_key" })
  periodKey!: string;

  @Column({ type: "varchar", length: 15, name: "run_kind" })
  runKind!: PyrlRunKind;

  @Column({ type: "uuid", name: "supplements_run_id", nullable: true })
  supplementsRunId!: string | null;

  @ManyToOne(() => PyrlRunEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "supplements_run_id" })
  supplementsRun?: PyrlRunEntity | null;

  @Column({ type: "varchar", length: 18, name: "status" })
  status!: PyrlRunStatus;

  @Column({ type: "uuid", name: "initiated_by" })
  initiatedBy!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "initiated_by" })
  initiator?: UsrUserEntity;

  @Column({ type: "uuid", name: "approved_by", nullable: true })
  approvedBy!: string | null;

  @ManyToOne(() => UsrUserEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "approved_by" })
  approver?: UsrUserEntity | null;

  @Column({ type: "timestamptz", name: "committed_at", nullable: true })
  committedAt!: Date | null;

  @Column({ type: "uuid", name: "journal_id", nullable: true })
  journalId!: string | null;

  @ManyToOne(() => GlJournalEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "journal_id" })
  journal?: GlJournalEntity | null;

  /** Opaque jsonb — see class doc comment. */
  @Column({ type: "jsonb", name: "totals", default: {} })
  totals!: Record<string, unknown>;

  /** Opaque jsonb, nullable — see class doc comment. */
  @Column({ type: "jsonb", name: "variance_report", nullable: true })
  varianceReport!: Record<string, unknown> | null;
}

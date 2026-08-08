import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../shared/database/mutable-base.entity";
import { GlFiscalYearEntity } from "./gl-fiscal-year.entity";

export type GlBudgetStatus = "DRAFT" | "PENDING_APPROVAL" | "ACTIVE" | "SUPERSEDED";
export const GL_BUDGET_STATUSES: readonly GlBudgetStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "ACTIVE",
  "SUPERSEDED",
];

/**
 * Maps to `gl_budget` (docs/phase-4/02-schema-platform-accounting.md §8).
 * `MutableBaseEntity` — a budget's `status` progresses `DRAFT ->
 * PENDING_APPROVAL -> ACTIVE -> SUPERSEDED` (the next pass's budget
 * approval workflow). `uq_gl_budget_active_p` is a partial unique index
 * (`WHERE status='ACTIVE'`) enforcing "at most one ACTIVE budget per fiscal
 * year" — mirrors `appr_workflow_version.uq_appr_workflow_version_current_p`
 * and `set_academic_year.uq_set_year_current_p`.
 *
 * `approval_ref` is a bare `uuid` with **no** FK — see `GlJournalEntity`'s
 * "Loose references" doc comment; it would point at
 * `platform/approvals.appr_instance`, a sibling module accounting-core may
 * not import.
 */
@Entity("gl_budget")
@Index("uq_gl_budget_active_p", ["fiscalYearId"], { unique: true, where: `"status" = 'ACTIVE'` })
@Check("ck_gl_budget_status", `"status" IN ('DRAFT','PENDING_APPROVAL','ACTIVE','SUPERSEDED')`)
export class GlBudgetEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "fiscal_year_id" })
  fiscalYearId!: string;

  @ManyToOne(() => GlFiscalYearEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "fiscal_year_id" })
  fiscalYear?: GlFiscalYearEntity;

  @Column({ type: "varchar", length: 80, name: "name" })
  name!: string;

  @Column({ type: "varchar", length: 20, name: "version_label" })
  versionLabel!: string;

  @Column({ type: "varchar", length: 15, name: "status" })
  status!: GlBudgetStatus;

  /** Bare uuid, no FK — see `GlJournalEntity`'s "Loose references" doc comment. */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;
}

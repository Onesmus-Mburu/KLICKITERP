import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { ApprWorkflowDefEntity } from "./appr-workflow-def.entity";

/**
 * Maps to `appr_workflow_version` (docs/phase-4/02-schema-platform-accounting.md
 * §6). `uq_appr_workflow_version_current_p` is a partial unique index
 * (`WHERE is_current`) scoped per `workflow_def_id` enforcing "exactly one
 * current version per workflow definition" at the DB layer — mirrors
 * `set_academic_year.uq_set_year_current_p` exactly;
 * `WorkflowVersionsService.setCurrent()`/`publishNewVersion()` unset the
 * previous current row inside the same transaction before setting a new one
 * (BR-APPR-04: workflow definition changes affect only documents submitted
 * after the change — in-flight `appr_instance` rows keep their own
 * `workflow_version_id`, so an old version is never deleted, only demoted
 * from `is_current`).
 *
 * **Deviation from the task brief's "MutableBaseEntity" default** (same
 * documented-exception pattern as `FileObjectEntity`/`CommMessageEntity`):
 * this table's own DDL column is itself named `version` (the workflow's
 * sequential *version number*, part of `uq(workflow_def_id, version)`'s
 * natural key) — a direct name collision with `MutableBaseEntity`'s
 * `@VersionColumn` (DR-007's optimistic-lock counter, also always named
 * `version`). Extending `BaseEntity` instead and declaring `version` as a
 * plain `@Column` avoids two TypeORM properties mapping to the same
 * physical column; this table has no optimistic-lock column as a result —
 * acceptable since every mutation (`setCurrent`/`publishNewVersion`) already
 * runs inside `tx()` with explicit find-then-save, not a blind partial
 * update racing another writer.
 */
@Entity("appr_workflow_version")
@Index("uq_appr_workflow_version_def_version", ["workflowDefId", "version"], { unique: true })
@Index("uq_appr_workflow_version_current_p", ["workflowDefId", "isCurrent"], {
  unique: true,
  where: '"is_current" = true',
})
export class ApprWorkflowVersionEntity extends BaseEntity {
  @Column({ type: "uuid", name: "workflow_def_id" })
  workflowDefId!: string;

  @ManyToOne(() => ApprWorkflowDefEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "workflow_def_id" })
  workflowDef?: ApprWorkflowDefEntity;

  @Column({ type: "int", name: "version" })
  version!: number;

  @Column({ type: "boolean", name: "is_current", default: false })
  isCurrent!: boolean;
}

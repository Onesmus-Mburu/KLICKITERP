import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { SetAcademicYearEntity } from "../../../platform/settings";
// NOTE: imported directly from their entity files, NOT `domains/students`'
// barrel (`../../students`) — the barrel's first export is `StudentsModule`,
// which pulls in every students controller/service at runtime, several of
// which (transitively) reach `std-student.entity.ts`, which imports
// `domains/billing`'s entities back (see that file's doc comment). Going
// through either barrel turns this legitimate entity-level FK relationship
// into a module-graph cycle that also drags in eager
// `@InjectRepository(...)` resolution, causing a real circular-require
// crash. Direct entity-file imports avoid ever loading
// `students.module.ts`/controllers as a side effect of loading this entity.
import { StdClassEntity } from "../../students/domain/std-class.entity";
import { StdFeeGroupEntity } from "../../students/domain/std-fee-group.entity";
import { StdStreamEntity } from "../../students/domain/std-stream.entity";

export type BillFeeStructureStatus = "DRAFT" | "PUBLISHED" | "SUPERSEDED";
export const BILL_FEE_STRUCTURE_STATUSES: readonly BillFeeStructureStatus[] = [
  "DRAFT",
  "PUBLISHED",
  "SUPERSEDED",
];

export type BillFeeStructureBoarding = "DAY" | "BOARDER";
export const BILL_FEE_STRUCTURE_BOARDING_KINDS: readonly BillFeeStructureBoarding[] = ["DAY", "BOARDER"];

/**
 * Maps to `bill_fee_structure` (docs/phase-4/03-schema-student-finance.md §3)
 * — a versioned, scoped (year/class/[stream]/[boarding]/[fee group]) fee
 * schedule spanning a WHOLE academic year. BR-BILL-03: a `PUBLISHED`
 * structure is immutable; changes create a new version
 * (`trg_bill_structure_immutable`, migration `0070`, enforced on the child
 * `bill_fee_structure_line` table — see that entity's doc comment).
 *
 * **Phase 6 Slice 3b (2026-07-29, migration `0210`)**: `term_id` moved OFF
 * this entity and onto `BillFeeStructureLineEntity` (each line now carries
 * its own `termId`/`dueDate`) — a deliberate, confirmed redesign so one
 * structure can price a whole year's worth of categories, each on its own
 * term and due date, instead of being pinned to a single term.
 *
 * **Deviation from the default `MutableBaseEntity`** (same documented-exception
 * pattern as `ApprWorkflowVersionEntity`, `platform/approvals/domain/appr-workflow-version.entity.ts`):
 * this table's own DDL column is itself named `version` (the structure's
 * sequential version number, part of the natural key alongside
 * `academic_year_id`/`class_id`/scope) — a direct name collision with
 * `MutableBaseEntity`'s `@VersionColumn` (DR-007's optimistic-lock counter,
 * also always named `version`). Extends `BaseEntity` instead and declares
 * `version` as a plain `@Column`; no optimistic-lock column results, which
 * is acceptable since every mutation (draft edits, publish) is expected to
 * run inside a transaction with explicit find-then-save, same rationale as
 * `ApprWorkflowVersionEntity`.
 *
 * **Expression unique index** — `uq(academic_year_id, class_id,
 * coalesce-scope, version)` (re-keyed off `academic_year_id` in migration
 * `0210`, was `term_id` before Slice 3b) means NULL-scope combinations
 * (`stream_id`/`boarding`/`fee_group_id`, all nullable) must still be
 * uniquely constrained, which plain Postgres `UNIQUE` cannot do (NULL <>
 * NULL). TypeORM's `@Index` decorator cannot express a `COALESCE(...)`
 * expression index — the real constraint is raw SQL in migration `0070`
 * (re-created in `0210`, `uq_bill_fee_structure_scope_version`); this entity
 * carries no `@Index`/`@Unique` decorator for it, only this comment pointing
 * at the migration as the source of truth.
 */
@Entity("bill_fee_structure")
@Check("ck_bill_fee_structure_status", `"status" IN ('DRAFT','PUBLISHED','SUPERSEDED')`)
@Check("ck_bill_fee_structure_boarding", `"boarding" IS NULL OR "boarding" IN ('DAY','BOARDER')`)
export class BillFeeStructureEntity extends BaseEntity {
  @Column({ type: "uuid", name: "academic_year_id" })
  academicYearId!: string;

  @ManyToOne(() => SetAcademicYearEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "academic_year_id" })
  academicYear?: SetAcademicYearEntity;

  @Column({ type: "uuid", name: "class_id" })
  classId!: string;

  @ManyToOne(() => StdClassEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "class_id" })
  klass?: StdClassEntity;

  @Column({ type: "uuid", name: "stream_id", nullable: true })
  streamId!: string | null;

  @ManyToOne(() => StdStreamEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "stream_id" })
  stream?: StdStreamEntity | null;

  @Column({ type: "varchar", length: 10, name: "boarding", nullable: true })
  boarding!: BillFeeStructureBoarding | null;

  @Column({ type: "uuid", name: "fee_group_id", nullable: true })
  feeGroupId!: string | null;

  @ManyToOne(() => StdFeeGroupEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "fee_group_id" })
  feeGroup?: StdFeeGroupEntity | null;

  /** Business version number — NOT the optimistic-lock counter, see class doc comment. */
  @Column({ type: "int", name: "version" })
  version!: number;

  @Column({ type: "varchar", length: 12, name: "status" })
  status!: BillFeeStructureStatus;

  @Column({ type: "timestamptz", name: "published_at", nullable: true })
  publishedAt!: Date | null;

  /** Loose uuid, no FK — `platform/users` is not in this module's `mayImport` list. */
  @Column({ type: "uuid", name: "published_by", nullable: true })
  publishedBy!: string | null;
}

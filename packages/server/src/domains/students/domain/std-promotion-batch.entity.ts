import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { SetAcademicYearEntity } from "../../../platform/settings";

/**
 * Maps to `std_promotion_batch` (docs/phase-4/03-schema-student-finance.md
 * §2) — a one-shot audit record of a year-rollover promotion run
 * (FR-BILL-005). `BaseEntity` — one-shot audit record, never edited after
 * insert, same treatment as `gl_integrity_run`.
 *
 * `from_year_id`/`to_year_id` are real FKs to `set_academic_year`
 * (`platform/settings`, already built — imported via its public barrel),
 * unlike `std_student.sponsor_id`/`.transport_route_id`, which are forward
 * references to a module that doesn't exist yet.
 */
@Entity("std_promotion_batch")
export class StdPromotionBatchEntity extends BaseEntity {
  @Column({ type: "uuid", name: "from_year_id" })
  fromYearId!: string;

  @ManyToOne(() => SetAcademicYearEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "from_year_id" })
  fromYear?: SetAcademicYearEntity;

  @Column({ type: "uuid", name: "to_year_id" })
  toYearId!: string;

  @ManyToOne(() => SetAcademicYearEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "to_year_id" })
  toYear?: SetAcademicYearEntity;

  @Column({ type: "timestamptz", name: "executed_at" })
  executedAt!: Date;

  /** FR-BILL-005 audit of rollover — counts, per-student failures (see `PromotionService`'s doc comment for the exact shape). */
  @Column({ type: "jsonb", name: "summary" })
  summary!: Record<string, unknown>;
}

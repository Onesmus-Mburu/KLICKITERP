import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { SetAcademicYearEntity } from "./set-academic-year.entity";

/**
 * Maps to `set_term` (docs/phase-4/02-schema-platform-accounting.md §4).
 * `uq_set_term_current_p` is a partial unique index over the *whole table*
 * (not scoped by `academic_year_id`) — the DDL specifies a single global
 * "current term" pointer, mirroring the single global "current academic
 * year" on `set_academic_year`. `billingLocked` is a guard flag only in
 * this module: once true, `AcademicCalendarService.updateTerm` blocks edits
 * to billing-affecting fields (seq/startsOn/endsOn); actual billing
 * enforcement is the future billing module's concern.
 */
@Entity("set_term")
@Index("uq_set_term_academic_year_id_seq", ["academicYearId", "seq"], { unique: true })
@Index("uq_set_term_current_p", ["isCurrent"], { unique: true, where: '"is_current" = true' })
export class SetTermEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "academic_year_id" })
  academicYearId!: string;

  @ManyToOne(() => SetAcademicYearEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "academic_year_id" })
  academicYear?: SetAcademicYearEntity;

  @Column({ type: "varchar", length: 20, name: "name" })
  name!: string;

  @Column({ type: "int", name: "seq" })
  seq!: number;

  @Column({ type: "date", name: "starts_on" })
  startsOn!: string;

  @Column({ type: "date", name: "ends_on" })
  endsOn!: string;

  @Column({ type: "boolean", name: "is_current", default: false })
  isCurrent!: boolean;

  @Column({ type: "boolean", name: "billing_locked", default: false })
  billingLocked!: boolean;
}

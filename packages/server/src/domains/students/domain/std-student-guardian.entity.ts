import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { StdGuardianEntity } from "./std-guardian.entity";
import { StdStudentEntity } from "./std-student.entity";

/**
 * Maps to `std_student_guardian` (docs/phase-4/03-schema-student-finance.md
 * §2) — the student↔guardian link with attributes (`relationship`,
 * `is_primary`, `receives_billing`). `uq_std_student_guardian_pair` enforces
 * one link row per (student, guardian) pair; `uq_std_student_guardian_primary_p`
 * is a partial unique index (`WHERE is_primary`) enforcing "exactly one
 * primary guardian per student" at the DB layer — `GuardiansService.linkToStudent()`
 * unsets the previous primary (if any) inside the same transaction before
 * setting a new one, same unset-then-set pattern as every other "exactly
 * one" invariant in this codebase (`set_academic_year.is_current`,
 * `brnd_theme` published, `gl_budget` active).
 */
@Entity("std_student_guardian")
@Index("uq_std_student_guardian_pair", ["studentId", "guardianId"], { unique: true })
@Index("uq_std_student_guardian_primary_p", ["studentId"], { unique: true, where: '"is_primary" = true' })
export class StdStudentGuardianEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "student_id" })
  studentId!: string;

  @ManyToOne(() => StdStudentEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "student_id" })
  student?: StdStudentEntity;

  @Column({ type: "uuid", name: "guardian_id" })
  guardianId!: string;

  @ManyToOne(() => StdGuardianEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "guardian_id" })
  guardian?: StdGuardianEntity;

  @Column({ type: "varchar", length: 30, name: "relationship" })
  relationship!: string;

  @Column({ type: "boolean", name: "is_primary", default: false })
  isPrimary!: boolean;

  @Column({ type: "boolean", name: "receives_billing", default: true })
  receivesBilling!: boolean;
}

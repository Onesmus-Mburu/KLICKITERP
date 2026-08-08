import { Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";

/**
 * Maps to `std_class` (docs/phase-4/03-schema-student-finance.md §2) — the
 * class ladder (e.g. "Grade 1", "Form 2"). `MutableBaseEntity` — ordinary
 * mutable config, same class as `std_stream`/`std_fee_group`.
 */
@Entity("std_class")
@Index("uq_std_class_name", ["name"], { unique: true })
export class StdClassEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 40, name: "name" })
  name!: string;

  @Column({ type: "int", name: "level" })
  level!: number;

  @Column({ type: "boolean", name: "is_active", default: true })
  isActive!: boolean;
}

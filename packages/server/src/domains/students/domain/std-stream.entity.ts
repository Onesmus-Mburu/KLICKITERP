import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { StdClassEntity } from "./std-class.entity";

/**
 * Maps to `std_stream` (docs/phase-4/03-schema-student-finance.md §2) — a
 * subdivision of a `std_class` (e.g. "Grade 1 East"). `parent_id`-style FK
 * `class_id` is `RESTRICT` (the DDL's default FK mode when no override is
 * noted, consistent with the rest of this codebase's precedent). `uq(class_id,
 * name)` — a stream name only needs to be unique within its own class.
 */
@Entity("std_stream")
@Index("uq_std_stream_class_name", ["classId", "name"], { unique: true })
@Index("ix_std_stream_class_id", ["classId"])
export class StdStreamEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "class_id" })
  classId!: string;

  @ManyToOne(() => StdClassEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "class_id" })
  klass?: StdClassEntity;

  @Column({ type: "varchar", length: 40, name: "name" })
  name!: string;
}

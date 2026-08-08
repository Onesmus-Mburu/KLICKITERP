import { Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";

/**
 * Maps to `std_fee_group` (docs/phase-4/03-schema-student-finance.md §2) —
 * a named cohort (e.g. "Boarders - Premium") a student may be tagged with
 * for fee-structure resolution purposes (Billing/Module 9 reads this FK,
 * doesn't yet exist). `MutableBaseEntity` — ordinary mutable config.
 */
@Entity("std_fee_group")
@Index("uq_std_fee_group_name", ["name"], { unique: true })
export class StdFeeGroupEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 60, name: "name" })
  name!: string;

  @Column({ type: "text", name: "description", nullable: true })
  description!: string | null;
}

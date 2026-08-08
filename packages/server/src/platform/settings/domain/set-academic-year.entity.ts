import { Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";

/**
 * Maps to `set_academic_year` (docs/phase-4/02-schema-platform-accounting.md
 * §4). `startsOn`/`endsOn` are plain `date` columns (business dates, not
 * timestamps, per docs/phase-4/01-standards-and-migrations.md §2) — kept as
 * ISO `YYYY-MM-DD` strings, TypeORM's convention for the `date` column type.
 * `uq_set_year_current_p` is a partial unique index (`WHERE is_current`)
 * enforcing "exactly one current academic year" at the DB layer;
 * `AcademicCalendarService.setCurrentYear` unsets the previous current row
 * inside the same transaction before setting a new one so this index is
 * never violated mid-flight.
 */
@Entity("set_academic_year")
@Index("uq_set_academic_year_name", ["name"], { unique: true })
@Index("uq_set_year_current_p", ["isCurrent"], { unique: true, where: '"is_current" = true' })
export class SetAcademicYearEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 20, name: "name" })
  name!: string;

  @Column({ type: "date", name: "starts_on" })
  startsOn!: string;

  @Column({ type: "date", name: "ends_on" })
  endsOn!: string;

  @Column({ type: "boolean", name: "is_current", default: false })
  isCurrent!: boolean;
}

import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { FileObjectEntity } from "../../../platform/files";
// NOTE: imported directly from their entity files, NOT `domains/billing`'s
// barrel (`../../billing`) — see class doc comment "sponsor_id/transport_route_id"
// for why: the barrel's first export is `BillingModule`, which pulls in
// `billing.module.ts` and (transitively, at runtime) every billing entity
// file, several of which import `StdStudentEntity` back. Going through
// either barrel turns this legitimate entity-level FK cycle into a
// module-graph cycle that also drags in `students.module.ts`'s
// controllers/services — and NestJS's `@InjectRepository(StdStudentEntity)`
// needs the class value eagerly (unlike TypeORM's `@ManyToOne(() => Entity)`
// thunks), so a real circular-require crash results
// ("A circular dependency has been detected inside @InjectRepository()").
// Importing the two leaf entity files directly avoids ever loading
// `billing.module.ts`/controllers as a side effect of loading this entity.
import { BillSponsorEntity } from "../../billing/domain/bill-sponsor.entity";
import { BillTransportRouteEntity } from "../../billing/domain/bill-transport-route.entity";
import { StdClassEntity } from "./std-class.entity";
import { StdFeeGroupEntity } from "./std-fee-group.entity";
import { StdStreamEntity } from "./std-stream.entity";

export type StdStudentStatus = "ACTIVE" | "ALUMNI" | "TRANSFERRED" | "SUSPENDED" | "WITHDRAWN";
export const STD_STUDENT_STATUSES: readonly StdStudentStatus[] = [
  "ACTIVE",
  "ALUMNI",
  "TRANSFERRED",
  "SUSPENDED",
  "WITHDRAWN",
];

/** Exit statuses BR-BILL-15/`trg_std_student_exit_guard` gate on `exit_cleared`. */
export const STD_STUDENT_EXIT_STATUSES: readonly StdStudentStatus[] = ["ALUMNI", "TRANSFERRED", "WITHDRAWN"];

export type StdStudentBoarding = "DAY" | "BOARDER";
export const STD_STUDENT_BOARDING_KINDS: readonly StdStudentBoarding[] = ["DAY", "BOARDER"];

/**
 * Maps to `std_student` (docs/phase-4/03-schema-student-finance.md §2) — the
 * core student record, the busiest read path in the system (FR-PAY-002
 * cashier lookup, ≤2s).
 *
 * **`search_name`** is a real Postgres STORED generated column (never
 * assigned by application code — `insert: false, update: false` — Postgres
 * computes it from `first_name`/`middle_name`/`last_name` on every
 * INSERT/UPDATE). TypeORM's `generatedType: 'STORED'` + `asExpression`
 * combo emits the correct `GENERATED ALWAYS AS (...) STORED` DDL when
 * `synchronize` is used, but this codebase migrates by hand (see migration
 * `0065`) — the entity's `asExpression` here is kept as the single source of
 * truth for the exact expression the migration's raw SQL must match
 * character-for-character.
 *
 * **`sponsor_id`/`transport_route_id`** — real FKs to `bill_sponsor`/
 * `bill_transport_route` (`domains/billing`), added by Module 9's
 * foundation pass (migration `0071`) once those tables existed; both
 * nullable, `RESTRICT` matches this codebase's default FK mode (a
 * sponsor/route with students still referencing it cannot be deleted;
 * deactivate it instead, same `is_active`-flag precedent as
 * `gl_account`/`std_class`). This is a **deliberate, documented exception**
 * to the normal "domain modules don't import each other" rule
 * (`module-deps.json`'s `domainModuleDefaults` note): `domains/billing`
 * already imports `domains/students` (real FKs to `std_student`/`std_class`/
 * etc., per its own `mayImport` entry), and this is the mirror-image
 * one-directional-per-field-pair exception in the other direction —
 * `domains/students` imports ONLY `BillSponsorEntity`/`BillTransportRouteEntity`
 * for these two FK targets, nothing else, making the overall relationship
 * bidirectional at the entity level (an unusual shape for this codebase,
 * called out explicitly here and in `module-deps.json`) but justified by
 * the schema's own design coupling students↔billing tightly via
 * sponsor/transport references. Both entities are imported from their
 * specific entity files rather than `domains/billing`'s barrel — see the
 * import statement's own comment for why (a real circular-require crash
 * otherwise). Originally (Module 8) these were bare `uuid` columns with no
 * FK since Billing didn't exist yet — see migration `0065`'s doc comment
 * for that history.
 *
 * **`photo_file_id`** → `file_object` (imported via `platform/files`' public
 * barrel), nullable, `SET NULL` — a deleted photo shouldn't block deleting
 * the student photo's own file row.
 *
 * **Exit clearance**: BR-BILL-15 ("cannot flip to an exit status with a
 * nonzero balance without a documented clearance decision") is enforced in
 * the service layer (`StudentsService`, since the real balance check needs
 * Billing/Module 9, not built yet — see that service's doc comment); DB-layer
 * defense-in-depth (G-04) lives at `trg_std_student_exit_guard` (migration
 * `0065`), a `BEFORE UPDATE` trigger rejecting any flip into `ALUMNI`/
 * `TRANSFERRED`/`WITHDRAWN` from a non-exit status while `exit_cleared=false`.
 */
@Entity("std_student")
@Index("uq_std_student_admission_no", ["admissionNo"], { unique: true })
@Index("ix_std_student_class", ["classId", "streamId"], { where: `"status" = 'ACTIVE'` })
@Check("ck_std_student_status", `"status" IN ('ACTIVE','ALUMNI','TRANSFERRED','SUSPENDED','WITHDRAWN')`)
@Check("ck_std_student_boarding", `"boarding" IN ('DAY','BOARDER')`)
export class StdStudentEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "admission_no" })
  admissionNo!: string;

  @Column({ type: "varchar", length: 60, name: "first_name" })
  firstName!: string;

  @Column({ type: "varchar", length: 60, name: "middle_name", nullable: true })
  middleName!: string | null;

  @Column({ type: "varchar", length: 60, name: "last_name" })
  lastName!: string;

  /**
   * STORED generated column — computed by Postgres, never set by
   * application code. The GIN trigram index over `(search_name,
   * admission_no)` (FR-PAY-002 ≤2s lookup) is created in migration `0065`
   * raw SQL (TypeORM has no `gin_trgm_ops` operator-class support via
   * decorators).
   */
  @Column({
    type: "text",
    name: "search_name",
    insert: false,
    update: false,
    generatedType: "STORED",
    asExpression: `lower(first_name || ' ' || coalesce(middle_name, '') || ' ' || last_name)`,
  })
  searchName!: string;

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

  @Column({ type: "varchar", length: 15, name: "status" })
  status!: StdStudentStatus;

  @Column({ type: "varchar", length: 10, name: "boarding" })
  boarding!: StdStudentBoarding;

  @Column({ type: "uuid", name: "fee_group_id", nullable: true })
  feeGroupId!: string | null;

  @ManyToOne(() => StdFeeGroupEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "fee_group_id" })
  feeGroup?: StdFeeGroupEntity | null;

  /** Real FK to `bill_sponsor` (`domains/billing`) — see class doc comment. */
  @Column({ type: "uuid", name: "sponsor_id", nullable: true })
  sponsorId!: string | null;

  @ManyToOne(() => BillSponsorEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "sponsor_id" })
  sponsor?: BillSponsorEntity | null;

  /** Real FK to `bill_transport_route` (`domains/billing`) — see class doc comment. */
  @Column({ type: "uuid", name: "transport_route_id", nullable: true })
  transportRouteId!: string | null;

  @ManyToOne(() => BillTransportRouteEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "transport_route_id" })
  transportRoute?: BillTransportRouteEntity | null;

  @Column({ type: "uuid", name: "photo_file_id", nullable: true })
  photoFileId!: string | null;

  @ManyToOne(() => FileObjectEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "photo_file_id" })
  photoFile?: FileObjectEntity | null;

  @Column({ type: "jsonb", name: "custom_fields", default: {} })
  customFields!: Record<string, unknown>;

  @Column({ type: "date", name: "enrolled_on" })
  enrolledOn!: string;

  @Column({ type: "date", name: "exited_on", nullable: true })
  exitedOn!: string | null;

  @Column({ type: "boolean", name: "exit_cleared", default: false })
  exitCleared!: boolean;
}

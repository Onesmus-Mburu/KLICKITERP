import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { UsrUserEntity, UsrDepartmentEntity } from "../../../platform/users";
import { GlCostCenterEntity } from "../../../accounting";

export type PyrlEmploymentType = "PERMANENT" | "CONTRACT" | "CASUAL" | "PART_TIME";
export const PYRL_EMPLOYMENT_TYPES: readonly PyrlEmploymentType[] = [
  "PERMANENT",
  "CONTRACT",
  "CASUAL",
  "PART_TIME",
];

/**
 * Maps to `pyrl_employee` (docs/phase-4/04-schema-operations.md §4) — the
 * payroll employee master. Module 15 (Payroll) **foundation pass only**
 * (docs/phase-5/PROGRESS.md): entities/repositories/migration/triggers.
 * Application services (assignment/component management, statutory
 * computation, loan amortization, run lifecycle, controllers, tests, the
 * real statutory rate seed) land in later passes.
 *
 * `MutableBaseEntity` — genuine post-creation editing: `is_active`
 * deactivation, job title/department/cost-center changes, `exit_date`
 * written on separation.
 *
 * **Encrypted columns** (`pay_details`, `bank_name`, `branch`, `account` —
 * the DDL's own "(enc)"/"(enc jsonb)" markers): all four stay typed `jsonb`
 * here (the DDL's own literal column type), storing a base64 AES-256-GCM
 * envelope STRING once the next pass's service layer populates them via
 * `shared/crypto/aes-gcm.util.ts`'s `encryptToBuffer(...).toString("base64")`
 * — the exact storage shape `SettingsService.encode()` already establishes
 * for `set_setting.value` when `is_secret=true` (see that service, which
 * reuses the SAME `aes-gcm.util.ts` primitives). This is deliberately NOT
 * the `usr_user.twofa_secret_enc`/`set_integration_config.config_enc` `bytea`
 * shape — those two columns were never specified as `jsonb` by any DDL, so
 * their authors were free to pick `bytea`; this DDL explicitly types these
 * four columns `jsonb`, so the storage shape must honor that. Encryption/
 * decryption itself is out of scope for this foundation pass (entity column
 * type only, per the task brief) — all four stay nullable, `unknown` from
 * this entity's point of view, populated by a future
 * `PayrollEmployeesService`.
 *
 * `user_id` is a nullable FK to `usr_user` (portal-account link, same shape
 * `std_guardian.user_id` established) — RESTRICT so a linked user account
 * can't be hard-deleted out from under a payroll employee record.
 *
 * `department_id` (`usr_department`) and `cost_center_id` (`gl_cost_center`)
 * are both required (no `NULL` marker in the DDL) — RESTRICT.
 *
 * `ix_pyrl_employee_full_name_trgm` (GIN `gin_trgm_ops` on `full_name`) is
 * the DDL's own `ix: GIN trgm(full_name)` — `pg_trgm` was enabled in
 * migration `0001`, whose own doc comment already names `pyrl_*` as a future
 * consumer. Backs `PyrlEmployeeRepository.searchByName()`.
 */
@Entity("pyrl_employee")
@Index("uq_pyrl_employee_staff_no", ["staffNo"], { unique: true })
@Check("ck_pyrl_employee_employment_type", `"employment_type" IN ('PERMANENT','CONTRACT','CASUAL','PART_TIME')`)
export class PyrlEmployeeEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 20, name: "staff_no" })
  staffNo!: string;

  @Column({ type: "uuid", name: "user_id", nullable: true })
  userId!: string | null;

  @ManyToOne(() => UsrUserEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "user_id" })
  user?: UsrUserEntity | null;

  @Column({ type: "varchar", length: 120, name: "full_name" })
  fullName!: string;

  @Column({ type: "varchar", length: 20, name: "national_id" })
  nationalId!: string;

  @Column({ type: "varchar", length: 15, name: "kra_pin" })
  kraPin!: string;

  @Column({ type: "varchar", length: 20, name: "nssf_no", nullable: true })
  nssfNo!: string | null;

  @Column({ type: "varchar", length: 20, name: "shif_no", nullable: true })
  shifNo!: string | null;

  @Column({ type: "varchar", length: 12, name: "employment_type" })
  employmentType!: PyrlEmploymentType;

  @Column({ type: "uuid", name: "department_id" })
  departmentId!: string;

  @ManyToOne(() => UsrDepartmentEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "department_id" })
  department?: UsrDepartmentEntity;

  @Column({ type: "varchar", length: 80, name: "job_title" })
  jobTitle!: string;

  @Column({ type: "date", name: "hire_date" })
  hireDate!: string;

  @Column({ type: "date", name: "exit_date", nullable: true })
  exitDate!: string | null;

  /** Opaque encrypted jsonb — see class doc comment. NULL until the next pass's service populates it. */
  @Column({ type: "jsonb", name: "pay_details", nullable: true })
  payDetails!: unknown | null;

  /** Opaque encrypted jsonb — see class doc comment. */
  @Column({ type: "jsonb", name: "bank_name", nullable: true })
  bankName!: unknown | null;

  /** Opaque encrypted jsonb — see class doc comment. */
  @Column({ type: "jsonb", name: "branch", nullable: true })
  branch!: unknown | null;

  /** Opaque encrypted jsonb — see class doc comment. */
  @Column({ type: "jsonb", name: "account", nullable: true })
  account!: unknown | null;

  @Column({ type: "uuid", name: "cost_center_id" })
  costCenterId!: string;

  @ManyToOne(() => GlCostCenterEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "cost_center_id" })
  costCenter?: GlCostCenterEntity;

  @Column({ type: "boolean", name: "is_active", default: true })
  isActive!: boolean;
}

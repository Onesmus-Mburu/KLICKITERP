import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { MoneyTransformer } from "../../../shared/money/money.transformer";
import { UsrDepartmentEntity } from "./usr-department.entity";

export type UsrUserStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
export type UsrUserType = "STAFF" | "PARENT" | "SYSTEM";

/**
 * Maps to `usr_user` (docs/phase-4/02-schema-platform-accounting.md §2).
 * `authority_limit_amount` uses the Money transformer (never a raw JS
 * number). `password_changed_at` has no NULL marker in the DDL but also no
 * stated default; defaulting it to `now()` at insert time avoids requiring
 * every INVITED-status insert to supply a value while staying NOT NULL.
 */
@Entity("usr_user")
@Index("uq_usr_user_username", ["username"], { unique: true })
@Index("uq_usr_user_email_p", ["email"], { unique: true, where: '"email" IS NOT NULL' })
@Index("uq_usr_user_phone_p", ["phone"], { unique: true, where: '"phone" IS NOT NULL' })
@Index("ix_usr_user_department_id", ["departmentId"])
@Check("ck_usr_user_status", `"status" IN ('INVITED','ACTIVE','SUSPENDED','DEACTIVATED')`)
@Check("ck_usr_user_user_type", `"user_type" IN ('STAFF','PARENT','SYSTEM')`)
@Check(
  "ck_usr_user_contact_or_parent",
  `"user_type" = 'PARENT' OR "phone" IS NOT NULL OR "email" IS NOT NULL`,
)
export class UsrUserEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 60, name: "username" })
  username!: string;

  @Column({ type: "varchar", length: 160, name: "email", nullable: true })
  email!: string | null;

  @Column({ type: "varchar", length: 20, name: "phone", nullable: true })
  phone!: string | null;

  @Column({ type: "varchar", length: 72, name: "password_hash" })
  passwordHash!: string;

  @Column({ type: "varchar", length: 120, name: "full_name" })
  fullName!: string;

  @Column({ type: "varchar", length: 20, name: "status" })
  status!: UsrUserStatus;

  @Column({ type: "varchar", length: 20, name: "user_type", default: "STAFF" })
  userType!: UsrUserType;

  @Column({ type: "boolean", name: "must_change_password", default: true })
  mustChangePassword!: boolean;

  @Column({ type: "boolean", name: "twofa_enabled", default: false })
  twofaEnabled!: boolean;

  @Column({ type: "bytea", name: "twofa_secret_enc", nullable: true })
  twofaSecretEnc!: Buffer | null;

  @Column({ type: "bytea", name: "recovery_codes_enc", nullable: true })
  recoveryCodesEnc!: Buffer | null;

  @Column({ type: "uuid", name: "department_id", nullable: true })
  departmentId!: string | null;

  @ManyToOne(() => UsrDepartmentEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "department_id" })
  department?: UsrDepartmentEntity | null;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "authority_limit_amount",
    nullable: true,
    transformer: MoneyTransformer,
  })
  authorityLimitAmount!: Money | null;

  @Column({ type: "timestamptz", name: "last_login_at", nullable: true })
  lastLoginAt!: Date | null;

  @Column({ type: "timestamptz", name: "password_changed_at", default: () => "now()" })
  passwordChangedAt!: Date;

  @Column({ type: "varchar", length: 8, name: "locale", default: "en" })
  locale!: string;
}

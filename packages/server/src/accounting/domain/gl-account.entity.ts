import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../shared/database/mutable-base.entity";

export type GlAccountClass = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
export const GL_ACCOUNT_CLASSES: readonly GlAccountClass[] = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "INCOME",
  "EXPENSE",
];

export type GlAccountControlDomain =
  | "AR_STUDENT"
  | "AR_SPONSOR"
  | "AP_SUPPLIER"
  | "WALLET"
  | "INVENTORY"
  | "PAYROLL"
  | "PREPAYMENT"
  | "MPESA_CLEARING"
  | "TRANSFER_CLEARING";
export const GL_ACCOUNT_CONTROL_DOMAINS: readonly GlAccountControlDomain[] = [
  "AR_STUDENT",
  "AR_SPONSOR",
  "AP_SUPPLIER",
  "WALLET",
  "INVENTORY",
  "PAYROLL",
  "PREPAYMENT",
  "MPESA_CLEARING",
  "TRANSFER_CLEARING",
];

/**
 * Maps to `gl_account` (docs/phase-4/02-schema-platform-accounting.md §8) —
 * the chart of accounts. `MutableBaseEntity` since accounts are ordinary
 * mutable config (name/active flag edits), same class as `gl_fiscal_year`/
 * `gl_period`/`gl_cost_center`/`gl_budget`.
 *
 * `parent_id` is a self-referential FK (`RESTRICT` — the DDL's default FK
 * mode when no override is noted; also consistent with BR-ACC-01's
 * deactivation-only policy, since a parent with children could never
 * legally be deleted anyway). `CHECK ck_gl_account_postable_needs_parent`
 * enforces "roots are headers": a root account (`parent_id IS NULL`) can
 * never be `is_postable = true`.
 *
 * BR-ACC-01 ("deactivation only — no DELETE on rows with postings") is
 * enforced by `trg_gl_account_deactivation_only` (migration `0060`), a
 * `BEFORE DELETE` trigger that rejects the delete whenever any
 * `gl_journal_line` references this account; nothing in this entity itself
 * blocks a DELETE call at the ORM layer (defense lives at the DB layer,
 * matching this whole module's trigger-first design).
 */
@Entity("gl_account")
@Index("uq_gl_account_code", ["code"], { unique: true })
@Index("ix_gl_account_parent_id", ["parentId"])
@Index("ix_gl_account_class", ["class"])
@Check("ck_gl_account_class", `"class" IN ('ASSET','LIABILITY','EQUITY','INCOME','EXPENSE')`)
@Check(
  "ck_gl_account_control_domain",
  `"control_domain" IS NULL OR "control_domain" IN ('AR_STUDENT','AR_SPONSOR','AP_SUPPLIER','WALLET','INVENTORY','PAYROLL','PREPAYMENT','MPESA_CLEARING','TRANSFER_CLEARING')`,
)
@Check("ck_gl_account_postable_needs_parent", `"is_postable" = false OR "parent_id" IS NOT NULL`)
export class GlAccountEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 20, name: "code" })
  code!: string;

  @Column({ type: "varchar", length: 120, name: "name" })
  name!: string;

  @Column({ type: "varchar", length: 15, name: "class" })
  class!: GlAccountClass;

  @Column({ type: "uuid", name: "parent_id", nullable: true })
  parentId!: string | null;

  @ManyToOne(() => GlAccountEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "parent_id" })
  parent?: GlAccountEntity | null;

  @Column({ type: "boolean", name: "is_postable" })
  isPostable!: boolean;

  @Column({ type: "boolean", name: "is_control" })
  isControl!: boolean;

  @Column({ type: "varchar", length: 20, name: "control_domain", nullable: true })
  controlDomain!: GlAccountControlDomain | null;

  @Column({ type: "boolean", name: "is_active", default: true })
  isActive!: boolean;

  @Column({ type: "varchar", length: 20, name: "tax_treatment", nullable: true })
  taxTreatment!: string | null;
}

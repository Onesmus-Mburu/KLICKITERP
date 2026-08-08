import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { GlAccountEntity } from "../../../accounting";

export type BankAccountKind = "BANK" | "CASH" | "MPESA_SETTLEMENT" | "PETTY";
export const BANK_ACCOUNT_KINDS: readonly BankAccountKind[] = ["BANK", "CASH", "MPESA_SETTLEMENT", "PETTY"];

/**
 * Maps to `bank_account` (docs/phase-4/04-schema-operations.md §5) — the
 * bank/cash/M-Pesa-settlement/petty-cash account register underpinning
 * Module 16 (Banking). **Foundation pass only**: entities/repositories/
 * migration/triggers (docs/phase-5/PROGRESS.md). Application services
 * (account management, deposits/withdrawals/transfers, statement import,
 * reconciliation workspace, cheque register) land in a later pass.
 *
 * `MutableBaseEntity` — genuine post-creation config edits (name/bank
 * details/`is_active` toggling), the same class every other config entity
 * this module-size uses (`gl_account`/`bank_cheque_book`).
 *
 * `gl_account_id` is a real, mandatory, UNIQUE FK to `gl_account`
 * (`accounting`, imported via its index.ts barrel only) — every bank account
 * maps to exactly one GL control/cash account, and vice versa (1:1 per the
 * DDL's own `UQ` marker).
 */
@Entity("bank_account")
@Index("uq_bank_account_name", ["name"], { unique: true })
@Index("uq_bank_account_gl_account_id", ["glAccountId"], { unique: true })
@Check("ck_bank_account_kind", `"kind" IN ('BANK','CASH','MPESA_SETTLEMENT','PETTY')`)
export class BankAccountEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 80, name: "name" })
  name!: string;

  @Column({ type: "varchar", length: 20, name: "kind" })
  kind!: BankAccountKind;

  @Column({ type: "varchar", length: 120, name: "bank_name", nullable: true })
  bankName!: string | null;

  @Column({ type: "varchar", length: 120, name: "branch", nullable: true })
  branch!: string | null;

  @Column({ type: "varchar", length: 40, name: "account_no", nullable: true })
  accountNo!: string | null;

  @Column({ type: "uuid", name: "gl_account_id" })
  glAccountId!: string;

  @ManyToOne(() => GlAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "gl_account_id" })
  glAccount?: GlAccountEntity;

  @Column({ type: "boolean", name: "is_active", default: true })
  isActive!: boolean;
}

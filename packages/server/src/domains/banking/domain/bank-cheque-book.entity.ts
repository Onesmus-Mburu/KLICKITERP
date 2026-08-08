import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { BankAccountEntity } from "./bank-account.entity";

/**
 * Maps to `bank_cheque_book` (docs/phase-4/04-schema-operations.md §5) — a
 * registered cheque book (leaf-number range) for one `bank_account`,
 * backing the cheque register (FR-BANK-005.1). Module 16 (Banking)
 * **foundation pass only**.
 *
 * `MutableBaseEntity` — genuine post-creation config edits, same class as
 * `bank_account` (e.g. correcting a mis-keyed `prefix`/leaf range before any
 * leaves have actually been issued — enforcing "don't edit once leaves
 * exist" is a service-layer concern for the next pass, not a DB constraint
 * here).
 *
 * `ck_bank_cheque_book_leaf_range` (`end_leaf >= start_leaf`) is this
 * pass's own sanity-check judgement call, the same "obvious range sanity
 * CHECK not literally spelled out in the DDL prose" precedent
 * `proc_contract.ck_proc_contract_dates` (`ends_on >= starts_on`)
 * established.
 */
@Entity("bank_cheque_book")
@Check("ck_bank_cheque_book_leaf_range", `"end_leaf" >= "start_leaf"`)
export class BankChequeBookEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "account_id" })
  accountId!: string;

  @ManyToOne(() => BankAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "account_id" })
  account?: BankAccountEntity;

  @Column({ type: "varchar", length: 10, name: "prefix" })
  prefix!: string;

  @Column({ type: "int", name: "start_leaf" })
  startLeaf!: number;

  @Column({ type: "int", name: "end_leaf" })
  endLeaf!: number;
}

import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { MoneyTransformer } from "../../../shared/money/money.transformer";
// Imported directly from its entity file, not `domains/procurement`'s
// barrel — same circular-require-avoidance discipline every cross-domain FK
// in this codebase follows. This pair is a genuine TWO-FILE mutual import
// (unlike the usual "diagonal" cycle e.g. students<->billing/payments<->
// wallet establish via different specific files on each side): after
// migration `0142` (this pass's own gap-closure migration),
// `proc-payment-voucher.entity.ts` imports `BankChequeLeafEntity` back from
// THIS file. This is safe — `@ManyToOne(() => Entity)` relation targets are
// thunks specifically so TypeORM/CommonJS can resolve a circular class
// reference lazily, well after both modules have finished loading; neither
// file evaluates the imported class at module-top-level, only inside the
// deferred arrow function. `domains/procurement` was added to
// `domains/banking`'s `mayImport` list (module-deps.json) for this.
import { ProcPaymentVoucherEntity } from "../../procurement/domain/proc-payment-voucher.entity";
import { BankChequeBookEntity } from "./bank-cheque-book.entity";

export type BankChequeLeafStatus =
  | "UNUSED"
  | "ISSUED"
  | "PRESENTED"
  | "CLEARED"
  | "STOPPED"
  | "CANCELLED"
  | "STALE";
export const BANK_CHEQUE_LEAF_STATUSES: readonly BankChequeLeafStatus[] = [
  "UNUSED",
  "ISSUED",
  "PRESENTED",
  "CLEARED",
  "STOPPED",
  "CANCELLED",
  "STALE",
];

/**
 * Maps to `bank_cheque_leaf` (docs/phase-4/04-schema-operations.md §5) — one
 * physical cheque leaf inside a `bank_cheque_book` (FR-BANK-005.1). Module
 * 16 (Banking) **foundation pass only**.
 *
 * `MutableBaseEntity` — real status progression `UNUSED -> ISSUED ->
 * PRESENTED -> CLEARED` (or `STOPPED`/`CANCELLED`/auto-flagged `STALE` past
 * 6 months per the DDL's own note), `payee`/`amount`/`issued_on` populated
 * only at issuance.
 *
 * `voucher_id` is a REAL, nullable FK directly to `proc_payment_voucher`
 * (Module 12/Procurement, already built) — the forward direction of the
 * task's two flagged forward-reference gaps: `proc_payment_voucher.
 * bank_account_id`/`.cheque_leaf_id` themselves remain loose uuid columns in
 * Procurement's own entity until migration `0142` (this pass) adds their
 * real FKs; THIS column is built as a real relation from day one, since
 * Procurement already exists to point at. See the import comment above for
 * the resulting two-file circular-import shape and why it's safe.
 *
 * `uq_bank_cheque_leaf_book_leaf` (`book_id`, `leaf_no`) is BR-BANK-04's own
 * per-book uniqueness rule; the sequential-issuance enforcement itself
 * (BR-BANK-04's "cheque numbers issue sequentially per book, skipping a
 * leaf requires a CANCELLED record with reason") is a service-layer concern
 * for the next pass — `BankChequeLeafRepository.findNextUnused()` is this
 * foundation pass's forward-looking finder for that future logic.
 */
@Entity("bank_cheque_leaf")
@Index("uq_bank_cheque_leaf_book_leaf", ["bookId", "leafNo"], { unique: true })
@Check(
  "ck_bank_cheque_leaf_status",
  `"status" IN ('UNUSED','ISSUED','PRESENTED','CLEARED','STOPPED','CANCELLED','STALE')`,
)
export class BankChequeLeafEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "book_id" })
  bookId!: string;

  @ManyToOne(() => BankChequeBookEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "book_id" })
  book?: BankChequeBookEntity;

  @Column({ type: "int", name: "leaf_no" })
  leafNo!: number;

  @Column({ type: "varchar", length: 10, name: "status" })
  status!: BankChequeLeafStatus;

  @Column({ type: "uuid", name: "voucher_id", nullable: true })
  voucherId!: string | null;

  @ManyToOne(() => ProcPaymentVoucherEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "voucher_id" })
  voucher?: ProcPaymentVoucherEntity | null;

  @Column({ type: "varchar", length: 120, name: "payee", nullable: true })
  payee!: string | null;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    nullable: true,
    transformer: MoneyTransformer,
  })
  amount!: Money | null;

  @Column({ type: "date", name: "issued_on", nullable: true })
  issuedOn!: string | null;

  @Column({ type: "text", name: "status_reason", nullable: true })
  statusReason!: string | null;
}

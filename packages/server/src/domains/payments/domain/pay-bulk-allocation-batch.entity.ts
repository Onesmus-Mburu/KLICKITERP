import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
// Imported directly from its entity file, not `domains/banking`'s barrel —
// same circular-require-avoidance discipline `PayReceiptSplitEntity`'s own
// `BankAccountEntity` import already establishes for this exact FK target
// (`domains/banking` is already in `domains/payments`' `mayImport` list,
// module-deps.json — no new module-dependency edge needed here).
import { BankAccountEntity } from "../../banking/domain/bank-account.entity";

export type PayBulkAllocationBatchStatus = "DRAFT" | "MATCHING" | "COMPLETED" | "FAILED";
export const PAY_BULK_ALLOCATION_BATCH_STATUSES: readonly PayBulkAllocationBatchStatus[] = [
  "DRAFT",
  "MATCHING",
  "COMPLETED",
  "FAILED",
];

/**
 * Maps to `pay_bulk_allocation_batch` (docs/phase-4/03-schema-student-finance.md
 * §4) — the parent of `pay_bulk_allocation_batch_line` (the DDL's single
 * `pay_bulk_allocation_batch` conceptual entry realized as 2 physical
 * tables, per the task brief). Module 10 (Payments) **foundation pass
 * only** (docs/phase-5/PROGRESS.md).
 *
 * `status`'s CHECK values are a **documented judgement call** — the DDL
 * specifies no enum for this column. `DRAFT` (uploaded/parsed, not yet
 * processed) `-> MATCHING` (bulk-allocation service is resolving each line's
 * student/amount against open invoices and creating receipts) `->
 * COMPLETED` (every line resolved, `created_receipts` reflects the final
 * count) `| FAILED` (unrecoverable error mid-run) mirrors the shape of every
 * other batch-run status machine in this codebase (e.g.
 * `bill_late_fee_batch`'s `DRAFT|PENDING_APPROVAL|POSTED`,
 * `std_promotion_batch`'s one-shot-audit-record treatment).
 *
 * `MutableBaseEntity` — `status` and `created_receipts` are both updated in
 * place as the batch progresses from upload through matching to completion,
 * long after the row is first created.
 *
 * `instrument` (jsonb) is the opaque uploaded-instrument payload (e.g. a
 * parsed bank statement / M-Pesa bulk-payment CSV row set) — interpreted by
 * the next pass's bulk-allocation service, not this foundation pass.
 *
 * `bank_account_id` is a **real FK to `bank_account`** (migration `0220`,
 * Phase 6 Slice 7) — every line in this batch is captured as a single
 * `BANK_TRANSFER` split against this one account. Added to fix a real,
 * verification-blocking bug found live in Slice 6:
 * `BulkAllocationService.matchAndPost()` previously fabricated a
 * non-UUID `bulk-batch-${batchId}` string for `pay_receipt_split
 * .bank_account_id` (a real `uuid` FK column), which failed every single
 * capture attempt outright. See migration `0220`'s own doc comment for the
 * full root-cause writeup and this dev environment's real backfill.
 */
@Entity("pay_bulk_allocation_batch")
@Check(
  "ck_pay_bulk_allocation_batch_status",
  `"status" IN ('DRAFT','MATCHING','COMPLETED','FAILED')`,
)
export class PayBulkAllocationBatchEntity extends MutableBaseEntity {
  @Column({ type: "jsonb", name: "instrument" })
  instrument!: Record<string, unknown>;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "total",
    transformer: RequiredMoneyTransformer,
  })
  total!: Money;

  @Column({ type: "varchar", length: 15, name: "status" })
  status!: PayBulkAllocationBatchStatus;

  @Column({ type: "int", name: "created_receipts", default: 0 })
  createdReceipts!: number;

  /** Real FK to `bank_account` (migration `0220`). See class doc comment. */
  @Column({ type: "uuid", name: "bank_account_id" })
  bankAccountId!: string;

  @ManyToOne(() => BankAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "bank_account_id" })
  bankAccount?: BankAccountEntity;
}

import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { MoneyTransformer, RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
// Imported directly from its entity file, not `domains/students`' barrel —
// same circular-require-avoidance discipline Module 9/10 established (see
// `PayReceiptEntity`'s import comment in `domains/payments/domain/pay-receipt.entity.ts`):
// going through the barrel would eagerly pull in `students.module.ts`'s
// controllers/services as a side effect of loading this entity, and NestJS's
// `@InjectRepository(StdStudentEntity)` needs the class value eagerly (unlike
// TypeORM's `@ManyToOne(() => Entity)` thunks), producing a real
// "circular dependency detected inside @InjectRepository()" crash.
import { StdStudentEntity } from "../../students/domain/std-student.entity";
import { WallServicePointType } from "./wall-service-point.entity";

export type WallWalletStatus = "ACTIVE" | "LOCKED" | "FROZEN" | "CLOSED";
export const WALL_WALLET_STATUSES: readonly WallWalletStatus[] = ["ACTIVE", "LOCKED", "FROZEN", "CLOSED"];

/**
 * Maps to `wall_wallet` (docs/phase-4/03-schema-student-finance.md §5) — one
 * prepaid wallet per student (`student_id` UNIQUE). `balance` is an N-2
 * cache column: BR-WALL-01 says "balance = Σ transactions under row lock,
 * never set directly by any code path outside this module" — every write to
 * `balance` in this codebase happens inside `WallWalletRepository
 * .findByIdForUpdate()`'s pessimistic-lock scope, from
 * `WalletTransactionsService`'s methods only (see that service's class doc
 * comment for the writer-guard-trigger judgement call: a heavy
 * `trg_gl_writer_guard`-style `application_name` gate was deliberately NOT
 * added here — see migration `0090`'s doc comment for the reasoning).
 *
 * `CHECK ck_wall_wallet_balance_floor` (`balance >= -overdraft_limit`,
 * BR-WALL-01's floor) is the DB-layer defense-in-depth backing
 * `WalletTransactionsService.spend()`'s own application-layer floor check.
 * `trg_wall_wallet_closed_requires_zero` (migration `0090`, BR-WALL-07) is a
 * `BEFORE UPDATE` trigger rejecting any flip to `status='CLOSED'` unless
 * `balance=0` — `WalletTransactionsService.closeWallet()` always zeroes the
 * balance via a disposition (refund/transfer/apply-to-fees) BEFORE setting
 * `status='CLOSED'`, so this trigger is the final defense-in-depth check,
 * never the primary mechanism.
 *
 * `category_blocks` stores a subset of `WALL_SERVICE_POINT_TYPES` — a
 * guardian/school-configured block list `WalletTransactionsService.spend()`
 * checks the target service point's `type` against (BR-WALL-03).
 * `daily_limit`/`txn_limit` may only TIGHTEN the school-policy maxima read
 * from Settings (`wallet.max_daily_limit`/`wallet.max_txn_limit`) —
 * `WalletsService.updateLimits()` enforces BR-WALL-04, this entity places no
 * constraint on the relationship between the two.
 */
@Entity("wall_wallet")
@Index("uq_wall_wallet_student_id", ["studentId"], { unique: true })
@Check("ck_wall_wallet_status", `"status" IN ('ACTIVE','LOCKED','FROZEN','CLOSED')`)
@Check("ck_wall_wallet_overdraft_limit_nonneg", `"overdraft_limit" >= 0`)
@Check("ck_wall_wallet_balance_floor", `"balance" >= -"overdraft_limit"`)
export class WallWalletEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "student_id" })
  studentId!: string;

  @ManyToOne(() => StdStudentEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "student_id" })
  student?: StdStudentEntity;

  @Column({ type: "varchar", length: 10, name: "status" })
  status!: WallWalletStatus;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "balance",
    default: 0,
    transformer: RequiredMoneyTransformer,
  })
  balance!: Money;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "overdraft_limit",
    default: 0,
    transformer: RequiredMoneyTransformer,
  })
  overdraftLimit!: Money;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "daily_limit",
    nullable: true,
    transformer: MoneyTransformer,
  })
  dailyLimit!: Money | null;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "txn_limit",
    nullable: true,
    transformer: MoneyTransformer,
  })
  txnLimit!: Money | null;

  @Column({ type: "varchar", length: 20, name: "category_blocks", array: true, default: [] })
  categoryBlocks!: WallServicePointType[];

  @Column({ type: "text", name: "status_reason", nullable: true })
  statusReason!: string | null;
}

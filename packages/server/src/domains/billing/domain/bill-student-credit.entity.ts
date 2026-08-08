import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
// Imported directly from its entity file, not `domains/students`' barrel —
// same circular-require-avoidance discipline every other cross-domain FK in
// this codebase follows (see `WallWalletEntity`'s identical import comment
// in `domains/wallet/domain/wall-wallet.entity.ts` for the precedent this
// entity mirrors most closely): going through the barrel would eagerly pull
// in `students.module.ts`'s controllers/services as a side effect of loading
// this entity, and NestJS's `@InjectRepository(StdStudentEntity)` needs the
// class value eagerly (unlike TypeORM's `@ManyToOne(() => Entity)` thunks),
// producing a real "circular dependency detected inside @InjectRepository()"
// crash. `domains/billing` already imports `StdStudentEntity` this exact way
// elsewhere (e.g. `bill-invoice.entity.ts`).
import { StdStudentEntity } from "../../students/domain/std-student.entity";

/**
 * Maps to `bill_student_credit` (migration `0235`) — Phase 6 Slice 12
 * (Part D — Credit Balance Forward). One row per student, the running
 * "credit balance forward" cache (docs/phase-1/SRS.md `FR-PAY-004`; the
 * `P-10` posting-map row in docs/phase-2/01-functional-requirements.md) —
 * documented since Phase 1/2, never implemented until this pass.
 *
 * **`MutableBaseEntity` judgement call**: `balance` is an N-1 cache column
 * incremented/decremented in place by `StudentCreditService.issue()`/
 * `.consume()`/`.netOutIssuedCredit()` — the exact same "derived balance,
 * updated under a row lock, real post-creation writes" shape
 * `wall_wallet.balance`/`bill_invoice.balance` already carry, both of which
 * extend `MutableBaseEntity` — mirrored here for the same reason.
 *
 * `balance` can NEVER go negative — `ck_bill_student_credit_balance_nonneg`
 * (`balance >= 0`, DB-layer defense-in-depth) backs every application-layer
 * check in `StudentCreditService`. Unlike `wall_wallet`, there is no
 * overdraft concept here at all (a credit balance either has money in it or
 * it doesn't — nothing analogous to a wallet's `overdraft_limit`).
 *
 * Owned by `domains/billing` (matches the `bill_` prefix and FR-PAY-004's
 * "applied to a future invoice" purpose) even though every WRITE here is
 * driven from `domains/payments`' `ReceiptsService`, via the new
 * `StudentCreditService` this pass adds — `domains/billing` may NOT import
 * `domains/payments` (`module-deps.json`'s one-directional boundary), the
 * same "Billing owns the table, Payments drives the writes through a small
 * Billing-owned service" shape `ReceiptsService.applyInvoiceAllocation()`
 * already establishes for `bill_invoice`/`bill_installment`.
 */
@Entity("bill_student_credit")
@Index("uq_bill_student_credit_student_id", ["studentId"], { unique: true })
@Check("ck_bill_student_credit_balance_nonneg", `"balance" >= 0`)
export class BillStudentCreditEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "student_id" })
  studentId!: string;

  @ManyToOne(() => StdStudentEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "student_id" })
  student?: StdStudentEntity;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "balance",
    default: 0,
    transformer: RequiredMoneyTransformer,
  })
  balance!: Money;
}

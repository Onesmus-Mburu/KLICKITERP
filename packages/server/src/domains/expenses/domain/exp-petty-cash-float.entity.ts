import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { UsrUserEntity } from "../../../platform/users";

/**
 * Maps to `exp_petty_cash_float` (docs/phase-4/04-schema-operations.md §4)
 * — one custodian's petty cash float (FR-EXP-003.1: "float per custodian").
 * Module 14 (Expenses) **foundation pass only**.
 *
 * `MutableBaseEntity` — genuine post-creation editing: `ceiling` can be
 * revised by management, and `balance` is debited by every
 * `exp_petty_cash_voucher` spend and credited by every `exp_replenishment`
 * payout — the defining "field that changes over time via a running
 * total" shape `WallWalletEntity.balance`/`InvStockBalanceEntity.qty`
 * established.
 *
 * `custodian_user_id` is a required, UNIQUE FK to `usr_user` (imported via
 * `platform/users`' index.ts barrel, entity-only, no circular-require risk)
 * — one float per custodian (FR-EXP-003.1).
 *
 * `ck_exp_petty_cash_float_balance_range` (`balance >= 0 AND balance <=
 * ceiling`) is BR-EXP-02's DB-layer backstop ("petty cash vouchers cannot
 * exceed the custodian's current float balance; replenishment restores at
 * most to the approved float ceiling") — the DDL's own literal CHECK
 * expression, enforced/DB per BR-EXP-02's own "SVC/DB" column. The real
 * spend/replenish arithmetic (debiting on voucher approval, crediting on
 * replenishment payout) is the next pass's service-layer concern;
 * `ExpPettyCashFloatRepository.findByIdForUpdate()` (this pass) is the
 * load-bearing pessimistic lock that engine will use, mirroring
 * `WallWalletRepository`/`InvStockBalanceRepository`'s exact discipline.
 */
@Entity("exp_petty_cash_float")
@Index("uq_exp_petty_cash_float_custodian", ["custodianUserId"], { unique: true })
@Check("ck_exp_petty_cash_float_balance_range", `"balance" >= 0 AND "balance" <= "ceiling"`)
export class ExpPettyCashFloatEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "custodian_user_id" })
  custodianUserId!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "custodian_user_id" })
  custodian?: UsrUserEntity;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "ceiling",
    transformer: RequiredMoneyTransformer,
  })
  ceiling!: Money;

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

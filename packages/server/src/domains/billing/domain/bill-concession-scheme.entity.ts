import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { GlAccountEntity } from "../../../accounting";

export type BillConcessionKind = "WAIVER" | "DISCOUNT" | "SCHOLARSHIP" | "BURSARY";
export const BILL_CONCESSION_KINDS: readonly BillConcessionKind[] = [
  "WAIVER",
  "DISCOUNT",
  "SCHOLARSHIP",
  "BURSARY",
];

export type BillConcessionCalc = "PERCENT" | "FIXED";
export const BILL_CONCESSION_CALCS: readonly BillConcessionCalc[] = ["PERCENT", "FIXED"];

/**
 * Maps to `bill_concession_scheme` (docs/phase-4/03-schema-student-finance.md
 * §3) — a reusable waiver/discount/scholarship/bursary template. `MutableBaseEntity`
 * — ordinary mutable config.
 *
 * `category_scope` (nullable `uuid[]`) restricts the scheme to specific
 * `bill_fee_category` rows — `NULL` means "applies to every category" (the
 * next pass's concession-application service interprets this, opaque here).
 * `gl_account_id` is a real FK to `gl_account` — the contra/expense account a
 * future posting credits when this scheme is applied.
 */
@Entity("bill_concession_scheme")
@Index("uq_bill_concession_scheme_name", ["name"], { unique: true })
@Check("ck_bill_concession_scheme_kind", `"kind" IN ('WAIVER','DISCOUNT','SCHOLARSHIP','BURSARY')`)
@Check("ck_bill_concession_scheme_calc", `"calc" IN ('PERCENT','FIXED')`)
export class BillConcessionSchemeEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 80, name: "name" })
  name!: string;

  @Column({ type: "varchar", length: 12, name: "kind" })
  kind!: BillConcessionKind;

  @Column({ type: "varchar", length: 10, name: "calc" })
  calc!: BillConcessionCalc;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "value",
    transformer: RequiredMoneyTransformer,
  })
  value!: Money;

  @Column({ type: "uuid", name: "category_scope", array: true, nullable: true })
  categoryScope!: string[] | null;

  @Column({ type: "boolean", name: "allows_stacking", default: false })
  allowsStacking!: boolean;

  @Column({ type: "uuid", name: "gl_account_id" })
  glAccountId!: string;

  @ManyToOne(() => GlAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "gl_account_id" })
  glAccount?: GlAccountEntity;

  @Column({ type: "boolean", name: "is_active", default: true })
  isActive!: boolean;
}

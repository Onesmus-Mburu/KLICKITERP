import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { GlAccountEntity } from "../../../accounting";

/**
 * Maps to `bill_fee_category` (docs/phase-4/03-schema-student-finance.md §3)
 * — a named billable category (e.g. "Tuition", "Transport", "Boarding").
 * `MutableBaseEntity` — ordinary mutable config, same class as
 * `bill_transport_route`/`bill_concession_scheme`/`bill_sponsor`/
 * `bill_late_fee_policy`.
 *
 * `gl_income_account_id` is a real FK to `gl_account` (`accounting`,
 * imported via its public barrel) — every fee category resolves to the
 * income account a future `PostingService.post()` call will credit.
 * `priority` is the allocation order used by the next pass's
 * category-priority concession/payment-application policy — opaque to this
 * foundation pass.
 */
@Entity("bill_fee_category")
@Index("uq_bill_fee_category_name", ["name"], { unique: true })
export class BillFeeCategoryEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 60, name: "name" })
  name!: string;

  @Column({ type: "uuid", name: "gl_income_account_id" })
  glIncomeAccountId!: string;

  @ManyToOne(() => GlAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "gl_income_account_id" })
  glIncomeAccount?: GlAccountEntity;

  @Column({ type: "boolean", name: "taxable", default: false })
  taxable!: boolean;

  @Column({ type: "boolean", name: "is_active", default: true })
  isActive!: boolean;

  @Column({ type: "int", name: "priority", default: 0 })
  priority!: number;
}

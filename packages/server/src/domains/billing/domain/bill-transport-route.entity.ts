import { Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";

/**
 * Maps to `bill_transport_route` (docs/phase-4/03-schema-student-finance.md
 * §3) — a named transport route with a flat fare amount. `MutableBaseEntity`
 * — ordinary mutable config.
 *
 * `std_student.transport_route_id` (Module 8) FKs here — this table closes
 * that Module 8 forward-reference gap (migration `0071`, see this pass's
 * report).
 */
@Entity("bill_transport_route")
@Index("uq_bill_transport_route_name", ["name"], { unique: true })
export class BillTransportRouteEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 60, name: "name" })
  name!: string;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    transformer: RequiredMoneyTransformer,
  })
  amount!: Money;

  @Column({ type: "boolean", name: "is_active", default: true })
  isActive!: boolean;
}

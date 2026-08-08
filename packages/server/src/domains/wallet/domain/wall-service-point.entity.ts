import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { MoneyTransformer } from "../../../shared/money/money.transformer";
import { GlAccountEntity } from "../../../accounting";

export type WallServicePointType =
  | "TRANSPORT"
  | "LIBRARY"
  | "SHOP"
  | "MEALS"
  | "PRINTING"
  | "TRIPS"
  | "ACTIVITIES"
  | "EMERGENCY"
  | "CUSTOM";
export const WALL_SERVICE_POINT_TYPES: readonly WallServicePointType[] = [
  "TRANSPORT",
  "LIBRARY",
  "SHOP",
  "MEALS",
  "PRINTING",
  "TRIPS",
  "ACTIVITIES",
  "EMERGENCY",
  "CUSTOM",
];

/**
 * Maps to `wall_service_point` (docs/phase-4/03-schema-student-finance.md §5)
 * — a spend point a wallet can be debited at (P-14). `gl_income_account_id`
 * is a real FK to `gl_account` (imported via `accounting`'s barrel — a plain
 * entity target, no sibling-domain circular-require concern, same as every
 * other module's `GlAccountEntity` FK). `wall_wallet.category_blocks` stores
 * a subset of `WALL_SERVICE_POINT_TYPES` (see that entity's doc comment) —
 * `WallTransactionsService.spend()` rejects a spend when the target service
 * point's `type` is in the wallet's block list (FR-WALL-009.1/BR-WALL-03
 * "category/service-point blocks").
 */
@Entity("wall_service_point")
@Index("uq_wall_service_point_name", ["name"], { unique: true })
@Check("ck_wall_service_point_type", `"type" IN ('TRANSPORT','LIBRARY','SHOP','MEALS','PRINTING','TRIPS','ACTIVITIES','EMERGENCY','CUSTOM')`)
export class WallServicePointEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 80, name: "name" })
  name!: string;

  @Column({ type: "varchar", length: 12, name: "type" })
  type!: WallServicePointType;

  @Column({ type: "uuid", name: "gl_income_account_id" })
  glIncomeAccountId!: string;

  @ManyToOne(() => GlAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "gl_income_account_id" })
  glIncomeAccount?: GlAccountEntity;

  @Column({ type: "boolean", name: "is_active", default: true })
  isActive!: boolean;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "per_txn_limit",
    nullable: true,
    transformer: MoneyTransformer,
  })
  perTxnLimit!: Money | null;
}

import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
// Direct entity-file import, not `domains/expenses`' barrel — same
// circular-require-avoidance discipline every cross-domain FK in this
// codebase follows (see `fa-asset.entity.ts`'s class-level import comment
// for the fuller precedent explanation). One-directional only —
// `domains/expenses` has no reason to reference `fa_maintenance` back.
import { ExpVoucherEntity } from "../../expenses/domain/exp-voucher.entity";
import { FaAssetEntity } from "./fa-asset.entity";

export type FaMaintenanceKind = "PLANNED" | "REPAIR";
export const FA_MAINTENANCE_KINDS: readonly FaMaintenanceKind[] = ["PLANNED", "REPAIR"];

/**
 * Maps to `fa_maintenance` (docs/phase-4/04-schema-operations.md §5) — a
 * planned or repair maintenance event against an asset. Module 17 (Fixed
 * Assets) **foundation pass only**.
 *
 * `MutableBaseEntity` — genuine post-creation editing: `done_on` starts
 * NULL and is filled in once the work completes, `downtime_note` is updated
 * as the event proceeds. The DDL gives this table no `status` enum column
 * at all (unlike `fa_transfer`'s task-brief grouping alongside it as a
 * "status-progression workflow document" — read here as progression via
 * `scheduled_on`/`done_on` nullability, not a literal status column); this
 * entity follows the DDL literally rather than inventing an unenumerated
 * status the source schema doesn't call for.
 *
 * **BR-FA-02** ("a disposed/written-off asset cannot receive further
 * transactions") is enforced via a `BEFORE INSERT` trigger on this table
 * calling the shared `fn_check_asset_not_disposed()` function (migration
 * `0150`) — the same function also guards `fa_transfer`/
 * `fa_depreciation_line` inserts.
 *
 * `cost_expense_voucher_id` is a nullable FK to `exp_voucher`
 * (`domains/expenses`, direct entity-file import per the class-level
 * comment above) — the actual GL-posting side of a REPAIR event's cost is
 * this expense voucher, populated only once the next pass's service layer
 * raises one; a `PLANNED` maintenance event with no cost yet leaves this
 * NULL.
 */
@Entity("fa_maintenance")
@Check("ck_fa_maintenance_kind", `"kind" IN ('PLANNED','REPAIR')`)
export class FaMaintenanceEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "asset_id" })
  assetId!: string;

  @ManyToOne(() => FaAssetEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "asset_id" })
  asset?: FaAssetEntity;

  @Column({ type: "varchar", length: 10, name: "kind" })
  kind!: FaMaintenanceKind;

  @Column({ type: "date", name: "scheduled_on", nullable: true })
  scheduledOn!: string | null;

  @Column({ type: "date", name: "done_on", nullable: true })
  doneOn!: string | null;

  @Column({ type: "uuid", name: "cost_expense_voucher_id", nullable: true })
  costExpenseVoucherId!: string | null;

  @ManyToOne(() => ExpVoucherEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "cost_expense_voucher_id" })
  costExpenseVoucher?: ExpVoucherEntity | null;

  @Column({ type: "text", name: "downtime_note" })
  downtimeNote!: string;
}

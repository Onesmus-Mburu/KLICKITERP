import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { FaDepreciationRunEntity } from "./fa-depreciation-run.entity";
import { FaAssetEntity } from "./fa-asset.entity";

/**
 * Maps to `fa_depreciation_line` (docs/phase-4/04-schema-operations.md §5,
 * the DDL's inline "+ fa_depreciation_line (run_id, asset_id, amount,
 * nbv_after); uq(run_id, asset_id)" shorthand) — one asset's computed
 * depreciation charge within a `fa_depreciation_run`. Module 17 (Fixed
 * Assets) **foundation pass only**.
 *
 * `run_id` (FK to `fa_depreciation_run`, `ON DELETE CASCADE`) is not spelled
 * out explicitly in the DDL's inline shorthand but is obviously required for
 * a child line table — the same "obvious parent FK the shorthand doesn't
 * spell out" judgement call `proc_grn_line`/`inv_stock_take_line` made for
 * their own parent FKs.
 *
 * **Base-class judgement call**: plain `BaseEntity`, NOT `MutableBaseEntity`
 * — depreciation lines are computed once by the next pass's run engine
 * (SL/RB formula against the run's period) and have no independent
 * post-creation edit window of their own: a still-`DRAFT` run's lines are
 * regenerated wholesale (delete-and-reinsert) by re-running the computation,
 * never edited in place, and once the parent run posts,
 * `trg_fa_depreciation_run_immutable` freezes the parent — lines are
 * logically frozen right alongside it. The same "computed once, frozen
 * alongside the parent" shape `GlJournalLineEntity` established for this
 * codebase's other posting-line tables.
 *
 * BR-FA-02 ("a disposed/written-off asset cannot receive further
 * transactions") is enforced here via a `BEFORE INSERT` trigger calling the
 * shared `fn_check_asset_not_disposed()` function (migration `0150`) — the
 * same function also guards `fa_maintenance`/`fa_transfer` inserts.
 *
 * `amount`/`nbv_after` are both ordinary money (`NUMERIC(18,4)`, matches
 * `Money`'s scale) — `RequiredMoneyTransformer` (never null once a line
 * exists at all).
 */
@Entity("fa_depreciation_line")
@Index("uq_fa_depreciation_line_run_asset", ["runId", "assetId"], { unique: true })
export class FaDepreciationLineEntity extends BaseEntity {
  @Column({ type: "uuid", name: "run_id" })
  runId!: string;

  @ManyToOne(() => FaDepreciationRunEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "run_id" })
  run?: FaDepreciationRunEntity;

  @Column({ type: "uuid", name: "asset_id" })
  assetId!: string;

  @ManyToOne(() => FaAssetEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "asset_id" })
  asset?: FaAssetEntity;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    transformer: RequiredMoneyTransformer,
  })
  amount!: Money;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "nbv_after",
    transformer: RequiredMoneyTransformer,
  })
  nbvAfter!: Money;
}

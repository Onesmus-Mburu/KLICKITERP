import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { FaVerificationEntity } from "./fa-verification.entity";
import { FaAssetEntity } from "./fa-asset.entity";

/**
 * Maps to `fa_verification_line` (docs/phase-4/04-schema-operations.md §5,
 * the DDL's inline "+ line child (asset, found bool, condition)" shorthand)
 * — one counted asset within an `fa_verification` session. Module 17
 * (Fixed Assets) **foundation pass only**.
 *
 * Designed EXACTLY per this pass's own explicit instruction, mirroring
 * `inv_stock_take_line`'s shape: `PK, verification_id -> fa_verification
 * CASCADE, asset_id -> fa_asset, found bool, condition varchar(20) NULL,
 * notes text NULL`.
 *
 * **Base-class judgement call**: `MutableBaseEntity` — `found`/`condition`/
 * `notes` all start unset and are filled in DURING the counting phase
 * (scanner/manual entry, FR-FA-007.1), the defining "real post-creation
 * edit window" shape this codebase's line-table judgement calls look for —
 * the exact same reasoning `InvStockTakeLineEntity.countedQty`'s own doc
 * comment gives for its identical `MutableBaseEntity` choice, not
 * `FaDepreciationLineEntity`'s "computed once, frozen" `BaseEntity`
 * divergence.
 *
 * `condition` mirrors `FaAssetEntity.condition`'s own untyped-`varchar(20)`
 * treatment (no CHECK-worthy enumerated value list given in the DDL).
 * `found` defaults to `false` — a line starts as "not yet scanned" and
 * flips `true` once the counting pass locates the asset; a line that stays
 * `false` through to session review is exactly FR-FA-007.1's own
 * missing-asset signal.
 */
@Entity("fa_verification_line")
export class FaVerificationLineEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "verification_id" })
  verificationId!: string;

  @ManyToOne(() => FaVerificationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "verification_id" })
  verification?: FaVerificationEntity;

  @Column({ type: "uuid", name: "asset_id" })
  assetId!: string;

  @ManyToOne(() => FaAssetEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "asset_id" })
  asset?: FaAssetEntity;

  @Column({ type: "boolean", name: "found", default: false })
  found!: boolean;

  @Column({ type: "varchar", length: 20, name: "condition", nullable: true })
  condition!: string | null;

  @Column({ type: "text", name: "notes", nullable: true })
  notes!: string | null;
}

import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { UsrUserEntity } from "../../../platform/users";
import { FaAssetEntity } from "./fa-asset.entity";

/**
 * Maps to `fa_transfer` (docs/phase-4/04-schema-operations.md §5) — an
 * asset's location/custodian handover event. Module 17 (Fixed Assets)
 * **foundation pass only**.
 *
 * `MutableBaseEntity` — genuine post-creation editing: `ack_by` starts NULL
 * and is filled in once the receiving custodian acknowledges the handover
 * (FR-FA's transfer-acknowledgment flow), the real post-creation edit window
 * that justifies this base class even though the DDL gives this table no
 * literal `status` enum column (the task brief groups `fa_transfer` among
 * "status-progression workflow documents", read here — same as
 * `fa_maintenance` — as progression via a nullable acknowledgment column,
 * not a status enum the DDL never names). A lighter-weight single-column
 * version of `bank_deposit`/`bank_withdrawal`'s own dual `ack_by_sender`/
 * `ack_by_receiver` acknowledgment pattern.
 *
 * **BR-FA-02** ("a disposed/written-off asset cannot receive further
 * transactions") is enforced via a `BEFORE INSERT` trigger on this table
 * calling the shared `fn_check_asset_not_disposed()` function (migration
 * `0150`) — the same function also guards `fa_maintenance`/
 * `fa_depreciation_line` inserts.
 *
 * `from_custodian_user_id`/`to_custodian_user_id`/`ack_by` are all nullable
 * FKs to `usr_user` (`platform/users`, barrel import) — a transfer may move
 * an asset between locations with no named custodian on either end (e.g. a
 * shared classroom asset).
 */
@Entity("fa_transfer")
export class FaTransferEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "asset_id" })
  assetId!: string;

  @ManyToOne(() => FaAssetEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "asset_id" })
  asset?: FaAssetEntity;

  @Column({ type: "varchar", length: 120, name: "from_location" })
  fromLocation!: string;

  @Column({ type: "uuid", name: "from_custodian_user_id", nullable: true })
  fromCustodianUserId!: string | null;

  @ManyToOne(() => UsrUserEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "from_custodian_user_id" })
  fromCustodian?: UsrUserEntity | null;

  @Column({ type: "varchar", length: 120, name: "to_location" })
  toLocation!: string;

  @Column({ type: "uuid", name: "to_custodian_user_id", nullable: true })
  toCustodianUserId!: string | null;

  @ManyToOne(() => UsrUserEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "to_custodian_user_id" })
  toCustodian?: UsrUserEntity | null;

  @Column({ type: "uuid", name: "ack_by", nullable: true })
  ackBy!: string | null;

  @ManyToOne(() => UsrUserEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "ack_by" })
  acknowledgedBy?: UsrUserEntity | null;

  @Column({ type: "timestamptz", name: "at" })
  at!: Date;
}

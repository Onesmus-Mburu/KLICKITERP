import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { MoneyTransformer, RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { GlJournalEntity } from "../../../accounting";
import { FaAssetEntity } from "./fa-asset.entity";

export type FaDisposalMethod = "SALE" | "SCRAP" | "DONATION" | "WRITE_OFF";
export const FA_DISPOSAL_METHODS: readonly FaDisposalMethod[] = ["SALE", "SCRAP", "DONATION", "WRITE_OFF"];

/**
 * **Status enum design decision** (the DDL gives `fa_disposal.status` no
 * spelled-out CHECK value list, unlike every other status column in this
 * schema): `DRAFT|PENDING_APPROVAL|APPROVED|POSTED`, mirroring
 * `fa_depreciation_run`'s shape — both are approval-gated, GL-posting
 * workflow documents (FR-FA-005.1: pick asset -> method -> proceeds ->
 * compute gain/loss -> approval `ASSET_DISPOSALS` -> P-31 -> register status
 * DISPOSED). The extra explicit `APPROVED` step (absent from
 * `fa_depreciation_run`'s leaner 3-value enum) mirrors `bank_transfer`'s own
 * 4-value `DRAFT|PENDING_APPROVAL|APPROVED|POSTED` shape instead — a
 * disposal's approval decision and its GL posting are two genuinely
 * separate moments (approval clears the sale/write-off; POSTED is the
 * actual P-31 journal + `fa_asset.status='DISPOSED'` register update), so a
 * dedicated `APPROVED` state gives the next pass's service layer a place to
 * land between those two events, the same way `bank_transfer`/
 * `bank_deposit`/`bank_withdrawal` all needed it.
 */
export type FaDisposalStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "POSTED";
export const FA_DISPOSAL_STATUSES: readonly FaDisposalStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "POSTED",
];

/**
 * Maps to `fa_disposal` (docs/phase-4/04-schema-operations.md §5) — the
 * disposal wizard's record (FR-FA-005.1). Module 17 (Fixed Assets)
 * **foundation pass only**.
 *
 * `MutableBaseEntity` — real status progression across the full
 * `DRAFT -> ... -> POSTED` lifecycle (see the `FaDisposalStatus` doc comment
 * above for the enum design decision), `journal_id` written only once
 * posted.
 *
 * `asset_id` is a required, UNIQUE FK to `fa_asset` (this module's own
 * entity) — the DDL's own `asset_id → UQ` marker: an asset can be disposed
 * at most once, ever (a disposed/written-off asset's record is retained
 * permanently per BR-FA-02, never re-disposed or deleted).
 *
 * `proceeds` (`NUMERIC(18,4)`, matches the DDL's own lack of a `NULL`
 * marker) is `RequiredMoneyTransformer` — always present, defaulting to 0
 * for methods with no cash proceeds (`DONATION`/`WRITE_OFF`).
 * `gain_loss` (`NUMERIC(18,4)`) is deliberately made NULLABLE — a judgement
 * call diverging from the DDL's own literal lack of a `NULL` marker, the
 * same divergence `InvStockTakeLineEntity.varianceValue`'s doc comment
 * documents for an identical reason: it is *computed* by the next pass's
 * disposal-wizard service (`proceeds - NBV at disposal`, FR-FA-005.1), not
 * knowable at the row's creation instant, so it stays NULL until that
 * computation runs.
 *
 * **`trg_fa_disposal_immutable`** (migration `0150`) freezes this row
 * UNCONDITIONALLY once `status='POSTED'` — the same "no further legitimate
 * progression past this state" reasoning `FaDepreciationRunEntity`'s own
 * doc comment gives, `POSTED` being this entity's own terminal state too.
 *
 * `approval_ref` is a loose `uuid` with no FK — same parity-only listing of
 * `platform/approvals` every other module this size has made; no entity
 * anywhere in this codebase ever takes a real FK to `appr_instance`.
 */
@Entity("fa_disposal")
@Index("uq_fa_disposal_asset_id", ["assetId"], { unique: true })
@Check("ck_fa_disposal_method", `"method" IN ('SALE','SCRAP','DONATION','WRITE_OFF')`)
@Check("ck_fa_disposal_status", `"status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','POSTED')`)
export class FaDisposalEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "asset_id" })
  assetId!: string;

  @ManyToOne(() => FaAssetEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "asset_id" })
  asset?: FaAssetEntity;

  @Column({ type: "varchar", length: 10, name: "method" })
  method!: FaDisposalMethod;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "proceeds",
    default: 0,
    transformer: RequiredMoneyTransformer,
  })
  proceeds!: Money;

  /** Computed by the next pass's disposal-wizard service — see class doc comment for why this is nullable. */
  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "gain_loss",
    nullable: true,
    transformer: MoneyTransformer,
  })
  gainLoss!: Money | null;

  @Column({ type: "varchar", length: 18, name: "status" })
  status!: FaDisposalStatus;

  /** Loose uuid, no FK — see class doc comment. */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;

  @Column({ type: "uuid", name: "journal_id", nullable: true })
  journalId!: string | null;

  @ManyToOne(() => GlJournalEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "journal_id" })
  journal?: GlJournalEntity | null;
}

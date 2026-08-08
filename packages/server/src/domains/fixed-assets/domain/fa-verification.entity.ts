import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { GlJournalEntity } from "../../../accounting";

export type FaVerificationStatus =
  | "OPEN"
  | "COUNTING"
  | "REVIEW"
  | "PENDING_APPROVAL"
  | "POSTED"
  | "CANCELLED";
export const FA_VERIFICATION_STATUSES: readonly FaVerificationStatus[] = [
  "OPEN",
  "COUNTING",
  "REVIEW",
  "PENDING_APPROVAL",
  "POSTED",
  "CANCELLED",
];

/**
 * Maps to `fa_verification` (docs/phase-4/04-schema-operations.md §5) — a
 * physical asset-verification session (FR-FA-007.1: "verification session
 * mirrors stock-take: scan/count, condition update, missing-asset report ->
 * write-off proposals"). Module 17 (Fixed Assets) **foundation pass only**.
 *
 * **Mirrors `inv_stock_take`'s shape EXACTLY**, per the DDL's own explicit
 * "session fields mirroring inv_stock_take" instruction — same 6-value
 * `status` enum (`OPEN -> COUNTING -> REVIEW -> PENDING_APPROVAL -> POSTED`
 * or `-> CANCELLED`), same `scope`/`snapshot_at`/`approval_ref`/
 * `journal_id` shape. Fixed Assets has no `fa_store`-equivalent table (asset
 * location lives on `fa_asset.location` itself, not a separate store
 * entity), so unlike `inv_stock_take.store_id` this entity carries no
 * dedicated location FK — `scope` (jsonb) alone carries the arbitrary
 * asset/location/category selector, the same "opaque selector, evaluated by
 * the service layer" role `InvStockTakeEntity.scope`'s own doc comment
 * documents.
 *
 * `MutableBaseEntity` — genuine post-creation status progression through the
 * full lifecycle, `approval_ref`/`journal_id` populated only once the
 * workflow reaches those later stages.
 *
 * **BR-FA-02's "missing-asset report -> write-off proposals"** flow (a
 * verification session finding an asset genuinely missing eventually feeds
 * `fa_disposal` with `method='WRITE_OFF'`) is a service-layer concern for
 * the next pass — this table records the count/condition data only, it does
 * not itself create `fa_disposal` rows.
 *
 * `approval_ref` is a loose `uuid` with no FK (same parity-only judgement
 * call `InvStockTakeEntity.approvalRef` made). `journal_id` is a nullable FK
 * to `gl_journal` (`accounting`, barrel import) — populated only if/when an
 * approved variance write-off posts through this session (mirroring
 * `inv_stock_take.journal_id`'s identical role).
 */
@Entity("fa_verification")
@Index("uq_fa_verification_number", ["number"], { unique: true })
@Check(
  "ck_fa_verification_status",
  `"status" IN ('OPEN','COUNTING','REVIEW','PENDING_APPROVAL','POSTED','CANCELLED')`,
)
export class FaVerificationEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "number" })
  number!: string;

  /** Arbitrary asset/location/category selector — see class doc comment for why there's no dedicated store-style FK. */
  @Column({ type: "jsonb", name: "scope" })
  scope!: Record<string, unknown>;

  @Column({ type: "timestamptz", name: "snapshot_at" })
  snapshotAt!: Date;

  @Column({ type: "varchar", length: 18, name: "status" })
  status!: FaVerificationStatus;

  /** Loose uuid, no FK — see class doc comment. */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;

  @Column({ type: "uuid", name: "journal_id", nullable: true })
  journalId!: string | null;

  @ManyToOne(() => GlJournalEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "journal_id" })
  journal?: GlJournalEntity | null;
}

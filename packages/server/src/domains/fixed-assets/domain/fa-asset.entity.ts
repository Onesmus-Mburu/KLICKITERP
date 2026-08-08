import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { UsrUserEntity } from "../../../platform/users";
// Direct entity-file imports, not `domains/procurement`'s barrel — same
// circular-require-avoidance discipline every cross-domain FK in this
// codebase follows (see `domains/banking`'s `bank-cheque-leaf.entity.ts` for
// the fullest precedent doc comment on why this matters: a barrel's first
// export is its `*Module` class, which eagerly pulls in the whole sibling
// module's controllers/services/repositories, turning a narrow entity-level
// FK into a real module-graph circular-require crash at
// `@InjectRepository()` time). UNLIKE the banking<->procurement pair, this
// relationship is NOT bidirectional — `domains/procurement` has no reason to
// reference `fa_asset` back, so there is no mutual-import shape to document,
// just the usual one-directional entity import `domains/students`'s own
// non-bidirectional cross-module FKs (e.g. `platform/files`) established.
import { ProcSupplierEntity } from "../../procurement/domain/proc-supplier.entity";
import { ProcPurchaseOrderEntity } from "../../procurement/domain/proc-purchase-order.entity";
import { ProcGrnEntity } from "../../procurement/domain/proc-grn.entity";
import { FaCategoryEntity } from "./fa-category.entity";

export type FaAssetFundingSource = "SCHOOL" | "GRANT" | "DONOR";
export const FA_ASSET_FUNDING_SOURCES: readonly FaAssetFundingSource[] = ["SCHOOL", "GRANT", "DONOR"];

export type FaAssetStatus = "ACTIVE" | "UNDER_MAINTENANCE" | "TRANSFERRED" | "DISPOSED" | "WRITTEN_OFF";
export const FA_ASSET_STATUSES: readonly FaAssetStatus[] = [
  "ACTIVE",
  "UNDER_MAINTENANCE",
  "TRANSFERRED",
  "DISPOSED",
  "WRITTEN_OFF",
];

/** Statuses at/beyond which BR-FA-02 blocks further transactions — see `fn_check_asset_not_disposed()` (migration `0150`). */
export const FA_ASSET_DISPOSED_STATUSES: readonly FaAssetStatus[] = ["DISPOSED", "WRITTEN_OFF"];

/**
 * Maps to `fa_asset` (docs/phase-4/04-schema-operations.md §5) — the asset
 * register itself (FR-FA-001.1: register fields incl. funding source,
 * condition, warranty). Module 17 (Fixed Assets) **foundation pass only**.
 *
 * `MutableBaseEntity` — genuine ongoing status/field progression:
 * `accum_depreciation` increments on every depreciation run, `status`/
 * `location`/`custodian_user_id` change repeatedly over the asset's life
 * (maintenance, transfers, eventual disposal) — the defining "real
 * post-creation edit window" shape, unlike a one-shot append-only record.
 *
 * **BR-FA-01** (`CHECK ck_fa_asset_accum_dep_within_depreciable_base`) —
 * `accum_depreciation <= cost - residual_value`, the DB-layer backstop only;
 * the *real* enforcement ("fully-depreciated assets stop depreciating
 * automatically") is a service-layer concern for the next pass's
 * depreciation-run engine (the business-rules catalogue marks BR-FA-01 as
 * SVC-enforced), this CHECK merely prevents an over-depreciated row from
 * ever being persisted at all, by any writer.
 *
 * **BR-FA-02** ("a disposed/written-off asset cannot receive further
 * transactions") — this pass's DB-level guard is the shared
 * `fn_check_asset_not_disposed()` function (migration `0150`), invoked via
 * `BEFORE INSERT` triggers on `fa_maintenance`/`fa_transfer`/
 * `fa_depreciation_line`, NOT on this table itself — `fa_asset.status` must
 * obviously remain freely writable in order to transition INTO
 * `DISPOSED`/`WRITTEN_OFF` in the first place.
 *
 * Real cross-module FKs: `category_id` (this module's own `fa_category`),
 * `custodian_user_id` -> `usr_user` (`platform/users`, nullable, barrel
 * import — no circular-require concern, `platform/users` never imports this
 * module), `supplier_id`/`po_id`/`grn_id` -> `proc_supplier`/
 * `proc_purchase_order`/`proc_grn` (`domains/procurement`, all nullable,
 * direct entity-file imports per the class-level import comment above).
 *
 * `insurance` is opaque jsonb (policy number/insurer/expiry — shape left to
 * the next pass's DTOs), the same "opaque jsonb, structure documented at the
 * service layer" convention `ExpVoucherEntity.payeeRef`/
 * `InvItemEntity.uomConversions` establish. `condition` is an un-enumerated
 * `varchar(20)` bucket (e.g. GOOD/FAIR/POOR) — the DDL gives no CHECK-worthy
 * value list for it (unlike `status`/`funding_source`), and
 * `fa_verification_line.condition` mirrors this same untyped-varchar
 * treatment. `photos uuid[]` is a loose, nullable array of `file_object`
 * ids — a Postgres array cannot carry a real FK constraint regardless
 * (structural limitation, not a scoping gap, same treatment
 * `inv_item.preferred_supplier_ids` gets); made nullable as a judgement call
 * since not every asset has photos captured at register time (the DDL gives
 * no explicit `NULL` marker either way for this column).
 */
@Entity("fa_asset")
@Index("uq_fa_asset_code", ["code"], { unique: true })
@Index("uq_fa_asset_barcode", ["barcode"], { unique: true, where: `"barcode" IS NOT NULL` })
@Check("ck_fa_asset_funding_source", `"funding_source" IN ('SCHOOL','GRANT','DONOR')`)
@Check(
  "ck_fa_asset_status",
  `"status" IN ('ACTIVE','UNDER_MAINTENANCE','TRANSFERRED','DISPOSED','WRITTEN_OFF')`,
)
@Check(
  "ck_fa_asset_accum_dep_within_depreciable_base",
  `"accum_depreciation" <= "cost" - "residual_value"`,
)
export class FaAssetEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "code" })
  code!: string;

  @Column({ type: "varchar", length: 120, name: "name" })
  name!: string;

  @Column({ type: "uuid", name: "category_id" })
  categoryId!: string;

  @ManyToOne(() => FaCategoryEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "category_id" })
  category?: FaCategoryEntity;

  @Column({ type: "varchar", length: 60, name: "serial_no", nullable: true })
  serialNo!: string | null;

  @Column({ type: "varchar", length: 60, name: "barcode", nullable: true })
  barcode!: string | null;

  @Column({ type: "varchar", length: 120, name: "location" })
  location!: string;

  @Column({ type: "uuid", name: "custodian_user_id", nullable: true })
  custodianUserId!: string | null;

  @ManyToOne(() => UsrUserEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "custodian_user_id" })
  custodian?: UsrUserEntity | null;

  @Column({ type: "date", name: "acquisition_date" })
  acquisitionDate!: string;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "cost",
    transformer: RequiredMoneyTransformer,
  })
  cost!: Money;

  @Column({ type: "varchar", length: 10, name: "funding_source" })
  fundingSource!: FaAssetFundingSource;

  @Column({ type: "uuid", name: "supplier_id", nullable: true })
  supplierId!: string | null;

  @ManyToOne(() => ProcSupplierEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "supplier_id" })
  supplier?: ProcSupplierEntity | null;

  @Column({ type: "uuid", name: "po_id", nullable: true })
  poId!: string | null;

  @ManyToOne(() => ProcPurchaseOrderEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "po_id" })
  po?: ProcPurchaseOrderEntity | null;

  @Column({ type: "uuid", name: "grn_id", nullable: true })
  grnId!: string | null;

  @ManyToOne(() => ProcGrnEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "grn_id" })
  grn?: ProcGrnEntity | null;

  @Column({ type: "date", name: "in_service_from" })
  inServiceFrom!: string;

  @Column({ type: "int", name: "life_months_override", nullable: true })
  lifeMonthsOverride!: number | null;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "residual_value",
    transformer: RequiredMoneyTransformer,
  })
  residualValue!: Money;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "accum_depreciation",
    default: 0,
    transformer: RequiredMoneyTransformer,
  })
  accumDepreciation!: Money;

  @Column({ type: "varchar", length: 20, name: "status" })
  status!: FaAssetStatus;

  @Column({ type: "jsonb", name: "insurance", nullable: true })
  insurance!: Record<string, unknown> | null;

  @Column({ type: "varchar", length: 20, name: "condition" })
  condition!: string;

  /** Loose uuid[], no FK possible on a Postgres array — see class doc comment. */
  @Column({ type: "uuid", name: "photos", array: true, nullable: true })
  photos!: string[] | null;
}

import { Check, Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";

export type ProcSupplierStatus = "ACTIVE" | "BLACKLISTED" | "INACTIVE";
export const PROC_SUPPLIER_STATUSES: readonly ProcSupplierStatus[] = ["ACTIVE", "BLACKLISTED", "INACTIVE"];

/**
 * Maps to `proc_supplier` (docs/phase-4/04-schema-operations.md §2) — the
 * procurement supplier master. Module 12 (Procurement) **foundation pass
 * only** (docs/phase-5/PROGRESS.md): entities/repositories/migration/
 * triggers. Application services (requisition->quotation->PO workflow, GRN
 * receiving, 3-way match, payment vouchers, supplier ratings, controllers,
 * tests, seed) land in a later pass.
 *
 * `MutableBaseEntity` — genuine post-creation progression: `status` flips
 * ACTIVE<->BLACKLISTED<->INACTIVE (BR-PROC-05), `rating_delivery`/
 * `rating_quality` are recomputed periodically from GRN/PO timing data
 * (FR-PROC-011.1's "auto-metrics"), `rating_manual` is scored by staff.
 *
 * `payment_details` (jsonb) holds bank/M-Pesa payout details per the DDL's
 * own "-- bank/M-Pesa (encrypted fields)" comment — field-level encryption
 * is an application-layer concern for a future pass (no column-level pgcrypto
 * wrapping is applied in this foundation pass); the column is opaque jsonb
 * here, same treatment `bill_sponsor.contacts`/`pay_bulk_allocation_batch.instrument`
 * give their own opaque jsonb payloads.
 *
 * `rating_delivery`/`rating_quality`/`rating_manual` are `NUMERIC(3,2)` —
 * genuine 1-5 style scores, not currency — so they intentionally do NOT use
 * `MoneyTransformer`; left as the raw decimal string Postgres's `pg` driver
 * returns by default (same reasoning `money.transformer.ts`'s own doc
 * comment gives for why NUMERIC needs explicit handling, just not routed
 * through `Money` since these aren't money). A dedicated ratings value type
 * can be introduced by the application-layer pass if warranted.
 *
 * `categories varchar(40)[]` — a plain Postgres array column (`array: true`),
 * same pattern `wall_wallet.category_blocks`/`appr_level.user_ids` established.
 *
 * `ix_proc_supplier_name_trgm` (GIN `gin_trgm_ops` on `name`) is the DDL's own
 * `ix: GIN trgm(name)` — `pg_trgm` was enabled in migration `0001`, whose own
 * doc comment already names `proc_*` as a future consumer.
 */
@Entity("proc_supplier")
@Index("uq_proc_supplier_name", ["name"], { unique: true })
@Check("ck_proc_supplier_status", `"status" IN ('ACTIVE','BLACKLISTED','INACTIVE')`)
export class ProcSupplierEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 120, name: "name" })
  name!: string;

  @Column({ type: "varchar", length: 120, name: "trading_name", nullable: true })
  tradingName!: string | null;

  @Column({ type: "varchar", length: 15, name: "kra_pin", nullable: true })
  kraPin!: string | null;

  @Column({ type: "jsonb", name: "contacts", default: {} })
  contacts!: Record<string, unknown>;

  /** Bank/M-Pesa payout details — see class doc comment re: encryption being a future application-layer concern. */
  @Column({ type: "jsonb", name: "payment_details", default: {} })
  paymentDetails!: Record<string, unknown>;

  @Column({ type: "varchar", length: 40, name: "categories", array: true, default: [] })
  categories!: string[];

  @Column({ type: "int", name: "payment_terms_days", default: 30 })
  paymentTermsDays!: number;

  @Column({ type: "varchar", length: 12, name: "status" })
  status!: ProcSupplierStatus;

  @Column({ type: "text", name: "blacklist_reason", nullable: true })
  blacklistReason!: string | null;

  /** NUMERIC(3,2), not currency — see class doc comment. */
  @Column({ type: "numeric", precision: 3, scale: 2, name: "rating_delivery", nullable: true })
  ratingDelivery!: string | null;

  @Column({ type: "numeric", precision: 3, scale: 2, name: "rating_quality", nullable: true })
  ratingQuality!: string | null;

  @Column({ type: "numeric", precision: 3, scale: 2, name: "rating_manual", nullable: true })
  ratingManual!: string | null;
}

import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { GlJournalEntity } from "../../../accounting";
import { InvStoreEntity } from "./inv-store.entity";

export type InvStockTakeStatus =
  | "OPEN"
  | "COUNTING"
  | "REVIEW"
  | "PENDING_APPROVAL"
  | "POSTED"
  | "CANCELLED";
export const INV_STOCK_TAKE_STATUSES: readonly InvStockTakeStatus[] = [
  "OPEN",
  "COUNTING",
  "REVIEW",
  "PENDING_APPROVAL",
  "POSTED",
  "CANCELLED",
];

/**
 * Maps to `inv_stock_take` (docs/phase-4/04-schema-operations.md §3) — a
 * physical count session (FR-INV-009.1: create session -> freeze snapshot ->
 * count entry -> variance report -> approval `STOCK_ADJUSTMENTS` -> post).
 * Module 13 (Inventory) **foundation pass only**.
 *
 * `MutableBaseEntity` — genuine post-creation status progression through the
 * full `OPEN -> COUNTING -> REVIEW -> PENDING_APPROVAL -> POSTED` lifecycle
 * (or `-> CANCELLED`), and `approval_ref`/`journal_id` are populated only
 * once the workflow reaches those later stages.
 *
 * **BR-INV-03 (stock-take freeze between snapshot and posting) is a
 * SERVICE-layer concern, not a DB trigger** — `scope` (jsonb, an arbitrary
 * item/category/store selector) makes a generic DB-level "block movements on
 * counted items" trigger impractical: the trigger would need to parse and
 * evaluate an opaque jsonb predicate against every `inv_movement` insert,
 * which is exactly the kind of business-rule logic this codebase
 * consistently keeps in the application layer (compare BR-PROC-04's
 * "allocation <= invoice open balance" half, deliberately left to
 * Procurement's service layer for the same class of reason — see migration
 * `0100`'s doc comment). The next pass's stock-take service must check open
 * stock-takes' `scope` before permitting a movement against an item/store
 * currently frozen for counting.
 *
 * `approval_ref` is a loose `uuid` with no FK — `platform/approvals` is
 * deliberately not in this foundation pass's `mayImport` list yet (same
 * foundation-pass-stage judgement call `proc_requisition.approval_ref` made);
 * the next pass's service will call `ApprovalEngineService` directly and can
 * add the dependency then if warranted. `journal_id` is a nullable FK to
 * `gl_journal` (imported via `accounting`'s barrel) — populated only once
 * BR-INV-03's approved adjustment is posted.
 */
@Entity("inv_stock_take")
@Index("uq_inv_stock_take_number", ["number"], { unique: true })
@Check(
  "ck_inv_stock_take_status",
  `"status" IN ('OPEN','COUNTING','REVIEW','PENDING_APPROVAL','POSTED','CANCELLED')`,
)
export class InvStockTakeEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "number" })
  number!: string;

  @Column({ type: "uuid", name: "store_id" })
  storeId!: string;

  @ManyToOne(() => InvStoreEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "store_id" })
  store?: InvStoreEntity;

  /** Arbitrary item/category/store selector — see class doc comment for why BR-INV-03's freeze stays service-layer. */
  @Column({ type: "jsonb", name: "scope" })
  scope!: Record<string, unknown>;

  @Column({ type: "timestamptz", name: "snapshot_at" })
  snapshotAt!: Date;

  @Column({ type: "varchar", length: 18, name: "status" })
  status!: InvStockTakeStatus;

  /** Loose uuid, no FK — see class doc comment. */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;

  @Column({ type: "uuid", name: "journal_id", nullable: true })
  journalId!: string | null;

  @ManyToOne(() => GlJournalEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "journal_id" })
  journal?: GlJournalEntity | null;
}

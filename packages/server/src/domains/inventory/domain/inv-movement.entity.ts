import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { GlJournalEntity } from "../../../accounting";
import { InvItemEntity } from "./inv-item.entity";
import { InvStoreEntity } from "./inv-store.entity";

export type InvMovementType =
  | "RECEIPT"
  | "ISSUE"
  | "SALE"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "ADJUSTMENT"
  | "RETURN";
export const INV_MOVEMENT_TYPES: readonly InvMovementType[] = [
  "RECEIPT",
  "ISSUE",
  "SALE",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "ADJUSTMENT",
  "RETURN",
];

/**
 * Maps to `inv_movement` (docs/phase-4/04-schema-operations.md §3) — the
 * append-only movement ledger every stock change is recorded against
 * (FR-INV-003.1/FR-INV-006.1). Module 13 (Inventory) **foundation pass
 * only**. Plain `BaseEntity` (never updated/deleted after insert), the exact
 * same treatment `wall_transaction`/`gl_journal_line` get — inventory
 * valuation integrity depends on this ledger never being edited in place,
 * so unlike Wallet/GL (whose immutability is a documented *convention*, not
 * always a DB trigger), `inv_movement` genuinely warrants an explicit DB
 * trigger: **`trg_inv_movement_immutable`** (migration `0110`) —
 * `BEFORE UPDATE OR DELETE`, unconditional reject, no exceptions.
 *
 * `qty` is the signed physical quantity of this movement (`CHECK
 * ck_inv_movement_qty_nonzero`, `qty <> 0`) — positive for
 * RECEIPT/TRANSFER_IN/RETURN, negative for ISSUE/SALE/TRANSFER_OUT,
 * either sign for ADJUSTMENT. `unit_cost` is the weighted-average cost AT
 * movement time (FR-INV-003.1) — `NUMERIC(18,6)`, deliberately NOT routed
 * through `MoneyTransformer` for the same precision reason
 * `InvItemEntity.avgCost` documents (would silently truncate the DDL's own
 * deliberate extra decimal digit). `value` (`qty * unit_cost`, signed) IS
 * ordinary money (`NUMERIC(18,4)`, matches `Money`'s scale) — uses
 * `RequiredMoneyTransformer`.
 *
 * `ref_doc_type`/`ref_doc_id` is a polymorphic pointer to the document that
 * caused this movement (a GRN line, a POS sale, a transfer, a stock-take
 * adjustment, ...) — a Postgres FK cannot target a variable table, so this
 * stays a loose `(varchar, uuid)` pair with no DB-level referential
 * integrity, same structural limitation `preferred_supplier_ids uuid[]`
 * documents for a different reason (array vs. polymorphic union, both
 * un-FK-able for their own reasons).
 *
 * `department_id` is a loose nullable `uuid` with **no FK** — the source
 * DDL's own shorthand (`department_id NULL`) gives it no `→` arrow, unlike
 * `item_id →`/`store_id →` on the same line, so this is read as a
 * deliberate DDL choice, not an oversight: an ISSUE movement's department
 * context (FR-INV-003.1) is informational only at the ledger level, not
 * DB-enforced against `usr_department`.
 *
 * `journal_id` is a nullable FK to `gl_journal` (imported via `accounting`'s
 * barrel) — not every movement type posts to GL immediately in this
 * foundation pass's schema (e.g. a DRAFT stock-take variance may be recorded
 * before posting); the next pass's posting service decides when this gets
 * populated.
 *
 * **No writer-guard trigger** is added here or on `inv_stock_balance` — same
 * deliberate judgement call Wallet's migration `0090` made (see that
 * migration's own doc comment for the full reasoning): exactly one service
 * in this codebase will ever write these two tables, so a
 * `trg_gl_writer_guard`-style `application_name` gate (designed to solve
 * GL's genuine multi-module fan-in problem) would be over-engineering for a
 * single-writer table. Defense-in-depth instead comes from (1)
 * `ck_inv_stock_balance_qty_nonneg`/`ck_inv_movement_qty_nonzero`, (2) this
 * table's own `trg_inv_movement_immutable`, and (3)
 * `InvStockBalanceRepository.findByIdForUpdate()`'s row-lock discipline.
 */
@Entity("inv_movement")
@Index("ix_inv_movement_item_store_at", ["itemId", "storeId", "at"])
@Check(
  "ck_inv_movement_type",
  `"movement_type" IN ('RECEIPT','ISSUE','SALE','TRANSFER_OUT','TRANSFER_IN','ADJUSTMENT','RETURN')`,
)
@Check("ck_inv_movement_qty_nonzero", `"qty" <> 0`)
export class InvMovementEntity extends BaseEntity {
  @Column({ type: "uuid", name: "item_id" })
  itemId!: string;

  @ManyToOne(() => InvItemEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "item_id" })
  item?: InvItemEntity;

  @Column({ type: "uuid", name: "store_id" })
  storeId!: string;

  @ManyToOne(() => InvStoreEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "store_id" })
  store?: InvStoreEntity;

  @Column({ type: "varchar", length: 12, name: "movement_type" })
  movementType!: InvMovementType;

  /** Signed physical quantity, not currency — see class doc comment. */
  @Column({ type: "numeric", precision: 14, scale: 4, name: "qty" })
  qty!: string;

  /** NUMERIC(18,6), deliberately NOT Money-transformed — see class doc comment. */
  @Column({ type: "numeric", precision: 18, scale: 6, name: "unit_cost" })
  unitCost!: string;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "value",
    transformer: RequiredMoneyTransformer,
  })
  value!: Money;

  /** Polymorphic reference, no FK possible — see class doc comment. */
  @Column({ type: "varchar", length: 30, name: "ref_doc_type" })
  refDocType!: string;

  @Column({ type: "uuid", name: "ref_doc_id" })
  refDocId!: string;

  /** Loose uuid, no FK — see class doc comment (the DDL's own shorthand omits an arrow for this column). */
  @Column({ type: "uuid", name: "department_id", nullable: true })
  departmentId!: string | null;

  @Column({ type: "uuid", name: "journal_id", nullable: true })
  journalId!: string | null;

  @ManyToOne(() => GlJournalEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "journal_id" })
  journal?: GlJournalEntity | null;

  @Column({ type: "timestamptz", name: "at" })
  at!: Date;
}

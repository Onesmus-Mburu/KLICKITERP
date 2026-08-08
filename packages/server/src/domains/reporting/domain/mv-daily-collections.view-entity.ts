import { Money } from "../../../shared/money/money";

/**
 * READ-ONLY row shape for the `app.mv_daily_collections` materialized view
 * (migration `0160`, Part B) — feeds the Dashboard's collection trend chart
 * (FR-DASH-006.1, `DashboardKpisService.getCollectionTrendChart()`).
 * Originally fed the "Today's Collection" KPI too, until Phase 6 Slice 10
 * switched that ONE tile to a live `pay_receipt`/`pay_receipt_split` query
 * (`DashboardKpisService.getTodaysCollection()`'s own doc comment) — this MV
 * itself, and every other consumer of this row shape, is untouched by that
 * change. This is a **plain DTO, not a TypeORM
 * `@Entity`/`@ViewEntity`** — see `MaterializedViewsRepository`'s class doc
 * comment for the full "why plain DTOs, not `@ViewEntity`" reasoning. Never
 * written by application code (N-5) — the view itself is refreshed via
 * `REFRESH MATERIALIZED VIEW CONCURRENTLY`, never `INSERT`/`UPDATE`/`DELETE`.
 *
 * SQL (migration `0160`): groups `pay_receipt` (`status = 'POSTED'`, i.e.
 * excluding `REVERSED`) joined to `pay_receipt_split`, by
 * `receipt_date`/`split.method`/`receipt.cashier_id`, summing
 * `split.amount`.
 *
 * **Simplification from the DDL's own `(date, method, category, cashier)`
 * shape**: the `category` dimension (which would need
 * `pay_receipt_allocation` -> `bill_invoice_line` -> fee category, a
 * multi-hop join) is DROPPED — the task brief's own explicit allowance
 * ("if it adds excessive join complexity, simplify... the DDL's 'category'
 * column is aspirational, not load-bearing for the Dashboard KPI itself").
 * `(date, method, cashier)` is sufficient for FR-DASH-002.1's "Today's
 * Collection = Σ receipts posted today excluding reversals" and the trend
 * chart; a category breakdown can be added by a future migration without
 * touching this row shape's other columns.
 */
export class MvDailyCollectionsRow {
  /** `receipt_date` — ISO date string (`YYYY-MM-DD`). */
  collectionDate!: string;

  /** `pay_receipt_split.method` (e.g. `CASH`/`BANK`/`MPESA_STK`...) — plain `string`, not the `domains/payments` union type (no cross-module import at this layer, see `MaterializedViewsRepository`'s doc comment). */
  method!: string;

  /** `pay_receipt.cashier_id`. */
  cashierId!: string;

  /** Σ `pay_receipt_split.amount` for this `(date, method, cashier)` group. */
  amount!: Money;
}

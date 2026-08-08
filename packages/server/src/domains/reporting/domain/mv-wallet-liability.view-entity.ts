import { Money } from "../../../shared/money/money";

/**
 * READ-ONLY row shape for the `app.mv_wallet_liability` materialized view
 * (migration `0160`, Part B) — feeds the Dashboard's Wallet KPI and the
 * wallet/GL reconciliation cross-check (FR-DASH-002.1's Cash Flow figure's
 * sibling KPI; BR-WALL-08-adjacent). Plain DTO, not a TypeORM entity — see
 * `MaterializedViewsRepository`'s class doc comment.
 *
 * SQL (migration `0160`): `SELECT CURRENT_DATE AS snapshot_date,
 * COALESCE(SUM(balance), 0) AS total_balance FROM app.wall_wallet` — a
 * single-row aggregate (no `GROUP BY`), so it always returns exactly one row
 * even when `wall_wallet` is empty (`total_balance = 0`), unlike a
 * `GROUP BY CURRENT_DATE` formulation which would return zero rows against
 * an empty table.
 *
 * **Documented limitation — snapshot, not a time series**: `wall_wallet` (a
 * balance *cache* column, N-2) carries no historical date axis anywhere in
 * this schema, so this view cannot express genuine day-over-day trend data
 * despite the DDL's own `(date -> Σ balances)` shape suggesting one. It
 * models a single ALWAYS-CURRENT row keyed by `snapshot_date =
 * CURRENT_DATE`: every `REFRESH MATERIALIZED VIEW CONCURRENTLY` re-evaluates
 * `CURRENT_DATE` and diffs against the unique index on `snapshot_date` — on
 * the same calendar day this simply updates `total_balance` in place; the
 * moment the calendar rolls over, the previous day's row's key no longer
 * matches any row the query produces, so the CONCURRENTLY diff algorithm
 * DELETEs it and INSERTs today's — **no history ever accumulates in this
 * table**. A real daily time series would need a separate append-only
 * snapshot-history table this system doesn't have yet (out of this
 * foundation pass's scope — flagged for whichever future pass needs true
 * wallet-liability trending).
 */
export class MvWalletLiabilityRow {
  /** Always `CURRENT_DATE` as of the last refresh — see class doc comment for why this is a snapshot, not a history. */
  snapshotDate!: string;

  /** Σ `wall_wallet.balance` across every wallet, regardless of status (`CLOSED` wallets are always `0` per BR-WALL-07, so including them is a no-op). */
  totalBalance!: Money;
}

import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { Money } from "../../../shared/money/money";
import { MvDailyCollectionsRow } from "../domain/mv-daily-collections.view-entity";
import { MvArSummaryRow, MvArSummaryAgingBucket } from "../domain/mv-ar-summary.view-entity";
import { MvIncomeExpenseRow, MvIncomeExpenseAccountClass } from "../domain/mv-income-expense.view-entity";
import { MvWalletLiabilityRow } from "../domain/mv-wallet-liability.view-entity";
import { MvDefaultersRow } from "../domain/mv-defaulters.view-entity";

/** The 5 materialized view names created by migration `0160` Part B. */
export type ReportingMaterializedViewName =
  | "mv_daily_collections"
  | "mv_ar_summary"
  | "mv_income_expense"
  | "mv_wallet_liability"
  | "mv_defaulters";

export const REPORTING_MATERIALIZED_VIEW_NAMES: readonly ReportingMaterializedViewName[] = [
  "mv_daily_collections",
  "mv_ar_summary",
  "mv_income_expense",
  "mv_wallet_liability",
  "mv_defaulters",
];

/**
 * Read-only access + refresh for the 5 Dashboard-feeding materialized views
 * (docs/phase-4/02-schema-platform-accounting.md §8; migration `0160` Part
 * B). Module 18 (Reporting Engine + Dashboard) **foundation pass only** —
 * this is the single "keep it simple" REPOSITORY-layer helper the task
 * brief asked for, one query method per view plus a generic `refresh()`;
 * the actual Dashboard KPI service that calls these methods and shapes
 * their rows into API responses is a later pass's concern.
 *
 * **View-entity/query-access approach (documented per the task brief's own
 * "pick the approach and document it" instruction)**: these 5 views are
 * queried via plain `DataSource.query()` raw SQL, mapped by hand into the
 * plain DTO classes in `../domain/mv-*.view-entity.ts` — NOT TypeORM
 * `@ViewEntity`/`@Entity` classes registered with `dataSource.getRepository()`.
 * Two reasons: (1) none of these 5 views has a genuine single-column primary
 * key (each is a `GROUP BY` aggregate keyed by a *composite* of dimensions),
 * and TypeORM's `@ViewEntity` still expects the caller to manage its own
 * metadata registration; (2) `dataSource.getRepository(SomeViewEntity)`
 * requires that class to be registered in `AppDataSource`'s `entities: []`
 * array to have metadata at all — but the task brief is explicit that the
 * MV view-entities should NOT be registered there (they have no
 * migration/PK lifecycle in the normal TypeORM sense), so a `getRepository()`
 * path was never actually reachable without contradicting that instruction.
 * Plain `DataSource.query()` sidesteps both problems and keeps every column
 * mapping visible and explicit in one place (this file), rather than spread
 * across decorator metadata.
 *
 * `REFRESH MATERIALIZED VIEW CONCURRENTLY` (used by `refresh()`/
 * `refreshAll()`) requires the unique index each view carries (migration
 * `0160`) and must run OUTSIDE any ambient transaction — `DataSource.query()`
 * runs each call on its own pooled connection with no open transaction,
 * which is exactly what `CONCURRENTLY` needs (it errors if invoked inside
 * `BEGIN`/`COMMIT`).
 *
 * **No DB-level `fn_refresh_all_mvs()` wrapper function was added**
 * (migration `0160`'s own doc comment repeats this) — a documented,
 * deliberate omission: the 5 views need DIFFERENT refresh cadences (60s /
 * 60s / 5min / hourly / 5min per the DDL's own table), so a single
 * monolithic SQL function refreshing all 5 together would actively work
 * against that requirement once a real scheduler exists; `refreshAll()`
 * below exists only for ad-hoc/manual use (e.g. a first-refresh-after-seed
 * step), not as the mechanism a future per-view-cadence scheduler would
 * actually call — that scheduler will call `refresh(viewName)` one view at
 * a time, on its own timer.
 */
@Injectable()
export class MaterializedViewsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async refresh(viewName: ReportingMaterializedViewName): Promise<void> {
    await this.dataSource.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY app.${viewName}`);
  }

  async refreshAll(): Promise<void> {
    for (const viewName of REPORTING_MATERIALIZED_VIEW_NAMES) {
      await this.refresh(viewName);
    }
  }

  async findDailyCollections(): Promise<MvDailyCollectionsRow[]> {
    // `::text` cast on the `date` column — plain `pg` (unlike TypeORM's entity-hydration path)
    // parses `date` into a JS `Date` object by default; the cast keeps this repository's raw
    // `.query()` results consistent with every other `date`-typed column in this codebase
    // (returned as an ISO `YYYY-MM-DD` string, matching `MvDailyCollectionsRow.collectionDate`'s
    // declared `string` type).
    const rows: Array<{ collection_date: string; method: string; cashier_id: string; amount: string }> =
      await this.dataSource.query(
        `SELECT collection_date::text AS collection_date, method, cashier_id, amount FROM app.mv_daily_collections
         ORDER BY collection_date DESC, method ASC`,
      );
    return rows.map((row) => {
      const dto = new MvDailyCollectionsRow();
      dto.collectionDate = row.collection_date;
      dto.method = row.method;
      dto.cashierId = row.cashier_id;
      dto.amount = Money.fromDecimalString(row.amount);
      return dto;
    });
  }

  async findArSummary(): Promise<MvArSummaryRow[]> {
    const rows: Array<{ class_id: string; aging_bucket: MvArSummaryAgingBucket; balance: string }> =
      await this.dataSource.query(
        `SELECT class_id, aging_bucket, balance FROM app.mv_ar_summary ORDER BY class_id ASC, aging_bucket ASC`,
      );
    return rows.map((row) => {
      const dto = new MvArSummaryRow();
      dto.classId = row.class_id;
      dto.agingBucket = row.aging_bucket;
      dto.balance = Money.fromDecimalString(row.balance);
      return dto;
    });
  }

  async findIncomeExpense(): Promise<MvIncomeExpenseRow[]> {
    const rows: Array<{
      period_id: string;
      period_starts_on: string;
      period_ends_on: string;
      account_class: MvIncomeExpenseAccountClass;
      debit_total: string;
      credit_total: string;
    }> = await this.dataSource.query(
      `SELECT period_id, period_starts_on::text AS period_starts_on, period_ends_on::text AS period_ends_on,
              account_class, debit_total, credit_total
       FROM app.mv_income_expense ORDER BY period_starts_on ASC, account_class ASC`,
    );
    return rows.map((row) => {
      const dto = new MvIncomeExpenseRow();
      dto.periodId = row.period_id;
      dto.periodStartsOn = row.period_starts_on;
      dto.periodEndsOn = row.period_ends_on;
      dto.accountClass = row.account_class;
      dto.debitTotal = Money.fromDecimalString(row.debit_total);
      dto.creditTotal = Money.fromDecimalString(row.credit_total);
      return dto;
    });
  }

  /** Always returns exactly 0 or 1 row — see `MvWalletLiabilityRow`'s doc comment for the snapshot-not-timeseries design. */
  async findWalletLiability(): Promise<MvWalletLiabilityRow | null> {
    const rows: Array<{ snapshot_date: string; total_balance: string }> = await this.dataSource.query(
      `SELECT snapshot_date::text AS snapshot_date, total_balance FROM app.mv_wallet_liability LIMIT 1`,
    );
    if (rows.length === 0) return null;
    const dto = new MvWalletLiabilityRow();
    dto.snapshotDate = rows[0].snapshot_date;
    dto.totalBalance = Money.fromDecimalString(rows[0].total_balance);
    return dto;
  }

  async findDefaulters(): Promise<MvDefaultersRow[]> {
    const rows: Array<{
      student_id: string;
      admission_no: string;
      first_name: string;
      last_name: string;
      class_id: string;
      overdue_amount: string;
      days_overdue: number;
    }> = await this.dataSource.query(
      `SELECT student_id, admission_no, first_name, last_name, class_id, overdue_amount, days_overdue
       FROM app.mv_defaulters ORDER BY days_overdue DESC, overdue_amount DESC`,
    );
    return rows.map((row) => {
      const dto = new MvDefaultersRow();
      dto.studentId = row.student_id;
      dto.admissionNo = row.admission_no;
      dto.firstName = row.first_name;
      dto.lastName = row.last_name;
      dto.classId = row.class_id;
      dto.overdueAmount = Money.fromDecimalString(row.overdue_amount);
      dto.daysOverdue = Number(row.days_overdue);
      return dto;
    });
  }
}

import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { GlAccountRepository, GlPeriodAccountTotalRepository, GlPeriodRepository } from "../../../accounting";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { resolveControlAccount } from "../../billing";
import { CashFlowReport } from "./cash-flow.report";
import { MaterializedViewsRepository } from "../infrastructure/materialized-views.repository";
import { MvDefaultersRow } from "../domain/mv-defaulters.view-entity";
import { ReportResult } from "./report-registry.service";

export type CollectionTrendBucket = "day" | "week" | "month" | "term";

export interface CollectionTrendChartInput {
  bucket: CollectionTrendBucket;
  fromDate: string;
  toDate: string;
}

export interface CollectionTrendPoint {
  bucket: string;
  amount: Money;
}

export interface IncomeVsExpenseChartInput {
  fromPeriodId: string;
  toPeriodId: string;
}

export interface IncomeVsExpensePoint {
  periodId: string;
  periodStartsOn: string;
  periodEndsOn: string;
  income: Money;
  expense: Money;
  netSurplus: Money;
}

export interface CollectionRateResult {
  periodId: string;
  periodReceipts: Money;
  openingAr: Money;
  netBillings: Money;
  denominator: Money;
  /** `null` when `denominator` is zero (nothing was owed) — a rate is not meaningful, never reported as 0 or Infinity. */
  collectionRate: number | null;
}

interface RawTermRow {
  term_id: string;
  term_name: string;
  starts_on: string;
  ends_on: string;
}

/**
 * FR-DASH-002.1/FR-DASH-006.1 — reads the 5 Dashboard-feeding materialized
 * views via the foundation pass's `MaterializedViewsRepository` for every
 * KPI EXCEPT `getCollectionRate()` (needs a genuine ledger query — see its
 * own doc comment), `getCashFlow()` (delegates to the report-of-record
 * `CashFlowReport`, since no MV has a cash-in/cash-out shape), and — as of
 * Phase 6 Slice 10 — `getTodaysCollection()` (now a live query against
 * `pay_receipt`/`pay_receipt_split`, not `mv_daily_collections`; see its
 * own doc comment for why). This is Dashboard's "whole reason to exist" per
 * the task brief: reading the MVs for FAST first-paint KPI figures rather
 * than the ledger every screen load, the same "MV = Dashboard-speed,
 * report-of-record = FR-RPT-008 source of truth" split this entire module
 * has observed since the foundation pass — `getTodaysCollection()` is a
 * deliberate, narrow exception to that split (see its own doc comment),
 * not an abandonment of it; every other MV-backed method below is
 * untouched.
 *
 * **FR-DASH-009.1 real-time push is OUT OF SCOPE, documented here rather
 * than half-built**: no WebSocket gateway infrastructure exists ANYWHERE in
 * this codebase (`docs/phase-5/PROGRESS.md`'s environment status confirms
 * this system has been built HTTP-REST-only throughout every prior module)
 * — a `dashboard.kpi.updated` push event is therefore not implemented. Every
 * method below is a plain, synchronous, poll-friendly read — exactly the
 * "documented client-side fallback" FR-DASH-009.1 itself names, so this
 * service is fully usable today via ordinary polling.
 */
@Injectable()
export class DashboardKpisService {
  constructor(
    private readonly mvRepository: MaterializedViewsRepository,
    private readonly periodRepository: GlPeriodRepository,
    private readonly periodAccountTotalRepository: GlPeriodAccountTotalRepository,
    private readonly accountRepository: GlAccountRepository,
    private readonly cashFlowReport: CashFlowReport,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * FR-DASH-002.1's "Today's Collection" tile — Phase 6 Slice 10: computed
   * LIVE against `pay_receipt`/`pay_receipt_split` (`WHERE
   * r.status = 'POSTED' AND r.receipt_date = today`, summed by split
   * amount), no longer read from `mv_daily_collections`. This is the one
   * KPI a user most immediately expects to be exactly right the instant
   * they collect a payment, and `mv_daily_collections` has NO automatic
   * refresh cadence (`MvRefreshService`'s own doc comment: "Manually-
   * callable only... a real scheduler/worker process... does not exist
   * anywhere in this codebase") — a real receipt captured moments ago would
   * otherwise still show as `KSh 0.00` until someone clicks "Refresh data."
   * A single day's sum is cheap enough to compute live rather than reading
   * a possibly-stale snapshot for it.
   *
   * Raw `DataSource.query()`, not a `PayReceiptRepository`/QueryBuilder
   * call — deliberately matching TWO existing precedents rather than
   * inventing a third: (1) `getCollectionRate()` immediately below already
   * computes an almost-identical `SUM(pay_receipt_split.amount)` for
   * `POSTED` receipts in a date range this exact same way, in this exact
   * same file; (2) `module-deps.json`'s own `domains/reporting` entry
   * documents this module's established, deliberate convention for reading
   * `domains/payments` data: "raw `DataSource.query()` joins... entity
   * types not imported — only table names, so no entity-level FK is
   * added." Adding a new `PayReceiptRepository` method and importing
   * `PaymentsModule` into `ReportingModule` for DI would work too (nothing
   * in `module-deps.json` forbids it), but would be a materially bigger,
   * architecturally-inconsistent footprint for this one targeted fix than
   * this file's own already-proven raw-SQL precedent for the identical
   * shape of query — a real, deliberate deviation from the originally
   * planned "add it to `PayReceiptRepository`" approach, made after reading
   * this module's own documented convention, not before.
   *
   * Every OTHER KPI method below is untouched — still MV-backed, exactly as
   * before, per this fix's own explicit scope.
   */
  async getTodaysCollection(): Promise<{ date: string; total: Money }> {
    const today = new Date().toISOString().slice(0, 10);
    const rows: Array<{ total: string }> = await this.dataSource.query(
      `SELECT COALESCE(SUM(s.amount), 0)::text AS total
       FROM app.pay_receipt r
       JOIN app.pay_receipt_split s ON s.receipt_id = r.id
       WHERE r.status = 'POSTED' AND r.receipt_date = $1`,
      [today],
    );
    const total = Money.fromDecimalString(rows[0]?.total ?? "0");
    return { date: today, total };
  }

  /** `mv_ar_summary`, summed across every class/aging-bucket — FR-DASH-002.1's "Outstanding Fees" tile. */
  async getOutstandingFees(): Promise<{ total: Money; byBucket: Record<string, Money> }> {
    const rows = await this.mvRepository.findArSummary();
    const byBucket: Record<string, Money> = {};
    let total = Money.ZERO;
    for (const row of rows) {
      total = total.add(row.balance);
      byBucket[row.agingBucket] = (byBucket[row.agingBucket] ?? Money.ZERO).add(row.balance);
    }
    return { total, byBucket };
  }

  /**
   * **The one KPI that genuinely needs a ledger query, not a pure MV read**
   * — "opening AR" and "net billings" are not columns any materialized view
   * in this schema carries (documented explicitly, per the task brief).
   * Composed from `gl_period_account_total` for the `AR_STUDENT` control
   * account:
   *  - `openingAr` — the SAME cumulative-range technique
   *    `BalanceSheetReport` uses: sum every prior period's (`seq <
   *    target.seq`, same fiscal year) `debit_total - credit_total` for the
   *    `AR_STUDENT` account (ASSET, debit-normal).
   *  - `netBillings` — this period's OWN `debit_total` only for
   *    `AR_STUDENT` (documented approximation: gross new invoicing posted
   *    THIS period, not net of same-period collections/credit notes, which
   *    land on the same account's CREDIT leg and are excluded here
   *    specifically so they aren't double-subtracted against
   *    `periodReceipts`, which already captures collections separately).
   *  - `periodReceipts` — Σ `pay_receipt_split.amount` for `POSTED`
   *    receipts dated within the period's `[startsOn, endsOn]` (a raw SQL
   *    sum, the same style `FeeCollectionReport` uses).
   *  - `collectionRate` = `periodReceipts / (openingAr + netBillings)` — a
   *    plain ratio (not a `Money`), `null` when the denominator is zero
   *    (nothing was owed for the period — a rate has no meaning).
   */
  async getCollectionRate(periodId: string): Promise<CollectionRateResult> {
    const period = await this.periodRepository.findByIdOrFail(periodId);
    const arAccount = await resolveControlAccount(this.accountRepository, "AR_STUDENT");

    const fiscalYearPeriods = await this.periodRepository.listByFiscalYear(period.fiscalYearId);
    const priorPeriods = fiscalYearPeriods.filter((p) => p.seq < period.seq);
    const priorTotalsRows = await Promise.all(priorPeriods.map((p) => this.periodAccountTotalRepository.listByPeriod(p.id)));

    let openingAr = Money.ZERO;
    for (const totalsRows of priorTotalsRows) {
      for (const row of totalsRows) {
        if (row.accountId === arAccount.id) {
          openingAr = openingAr.add(row.debitTotal).subtract(row.creditTotal);
        }
      }
    }

    const thisPeriodTotals = await this.periodAccountTotalRepository.listByPeriod(period.id);
    const netBillings = thisPeriodTotals
      .filter((row) => row.accountId === arAccount.id)
      .reduce((sum, row) => sum.add(row.debitTotal), Money.ZERO);

    const receiptRows: Array<{ total: string }> = await this.dataSource.query(
      `SELECT COALESCE(SUM(s.amount), 0)::text AS total
       FROM app.pay_receipt r
       JOIN app.pay_receipt_split s ON s.receipt_id = r.id
       WHERE r.status = 'POSTED' AND r.receipt_date >= $1 AND r.receipt_date <= $2`,
      [period.startsOn, period.endsOn],
    );
    const periodReceipts = Money.fromDecimalString(receiptRows[0]?.total ?? "0");

    const denominator = openingAr.add(netBillings);
    const collectionRate = denominator.isZero()
      ? null
      : Number(periodReceipts.toDecimalString()) / Number(denominator.toDecimalString());

    return { periodId, periodReceipts, openingAr, netBillings, denominator, collectionRate };
  }

  /** Delegates to the report-of-record `CashFlowReport` — see class doc comment for why no MV backs this KPI. */
  async getCashFlow(fromDate: string, toDate: string): Promise<ReportResult> {
    return this.cashFlowReport.execute({ fromDate, toDate });
  }

  /** `mv_income_expense`, filtered to one period — FR-DASH-002.1's Revenue/Expenses/Surplus tile. */
  async getRevenueExpenseSurplus(periodId: string): Promise<{ revenue: Money; expense: Money; surplus: Money }> {
    const rows = (await this.mvRepository.findIncomeExpense()).filter((row) => row.periodId === periodId);
    let revenue = Money.ZERO;
    let expense = Money.ZERO;
    for (const row of rows) {
      if (row.accountClass === "INCOME") revenue = revenue.add(row.creditTotal.subtract(row.debitTotal));
      else expense = expense.add(row.debitTotal.subtract(row.creditTotal));
    }
    return { revenue, expense, surplus: revenue.subtract(expense) };
  }

  /** `mv_wallet_liability` — a snapshot, never a time series (see that view's own doc comment). */
  async getWalletLiability(): Promise<{ snapshotDate: string; totalBalance: Money }> {
    const row = await this.mvRepository.findWalletLiability();
    return row
      ? { snapshotDate: row.snapshotDate, totalBalance: row.totalBalance }
      : { snapshotDate: new Date().toISOString().slice(0, 10), totalBalance: Money.ZERO };
  }

  /** `mv_defaulters` row count — distinct overdue students. */
  async getDefaultersCount(): Promise<number> {
    return (await this.mvRepository.findDefaulters()).length;
  }

  /** `mv_defaulters`, already ordered worst-first (see that view's own doc comment) — sliced to `limit`. */
  async listTopDefaulters(limit: number): Promise<MvDefaultersRow[]> {
    return (await this.mvRepository.findDefaulters()).slice(0, limit);
  }

  /**
   * FR-DASH-006.1 collection trend chart — `mv_daily_collections` rows,
   * filtered to `[fromDate, toDate]` and bucketed by day/week/month/term.
   * `'week'` buckets to the UTC Monday of each row's date; `'month'` to
   * `YYYY-MM`; `'term'` joins against `set_term` (a small, separate raw
   * query for term boundaries only — `platform/settings` is already in this
   * module's `mayImport` list) since `mv_daily_collections` carries no
   * `term_id` axis of its own (documented on that view's own doc comment as
   * a dropped dimension).
   */
  async getCollectionTrendChart(input: CollectionTrendChartInput): Promise<CollectionTrendPoint[]> {
    const rows = (await this.mvRepository.findDailyCollections()).filter(
      (row) => row.collectionDate >= input.fromDate && row.collectionDate <= input.toDate,
    );

    if (input.bucket === "term") {
      return this.bucketByTerm(rows, input.fromDate, input.toDate);
    }

    const bucketed = new Map<string, Money>();
    for (const row of rows) {
      const key = bucketKeyFor(row.collectionDate, input.bucket);
      bucketed.set(key, (bucketed.get(key) ?? Money.ZERO).add(row.amount));
    }
    return [...bucketed.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([bucket, amount]) => ({ bucket, amount }));
  }

  private async bucketByTerm(
    rows: Array<{ collectionDate: string; amount: Money }>,
    fromDate: string,
    toDate: string,
  ): Promise<CollectionTrendPoint[]> {
    const terms: RawTermRow[] = await this.dataSource.query(
      `SELECT id AS term_id, name AS term_name, starts_on::text AS starts_on, ends_on::text AS ends_on
       FROM app.set_term
       WHERE starts_on <= $2 AND ends_on >= $1
       ORDER BY starts_on ASC`,
      [fromDate, toDate],
    );

    return terms.map((term) => {
      const amount = rows
        .filter((row) => row.collectionDate >= term.starts_on && row.collectionDate <= term.ends_on)
        .reduce((sum, row) => sum.add(row.amount), Money.ZERO);
      return { bucket: term.term_name, amount };
    });
  }

  /**
   * FR-DASH-006.1 income-vs-expense chart — `mv_income_expense` rows for
   * every period between `fromPeriodId`/`toPeriodId` (inclusive, same
   * fiscal year required — the identical range-resolution rule
   * `IncomeStatementReport` enforces, since INCOME/EXPENSE accounts reset
   * every fiscal year).
   */
  async getIncomeVsExpenseChart(input: IncomeVsExpenseChartInput): Promise<IncomeVsExpensePoint[]> {
    const [fromPeriod, toPeriod] = await Promise.all([
      this.periodRepository.findByIdOrFail(input.fromPeriodId),
      this.periodRepository.findByIdOrFail(input.toPeriodId),
    ]);
    if (fromPeriod.fiscalYearId !== toPeriod.fiscalYearId) {
      throw new ValidationException(
        `getIncomeVsExpenseChart: fromPeriodId and toPeriodId must belong to the same fiscal year`,
      );
    }

    const fiscalYearPeriods = await this.periodRepository.listByFiscalYear(fromPeriod.fiscalYearId);
    const includedIds = new Set(
      fiscalYearPeriods.filter((p) => p.seq >= fromPeriod.seq && p.seq <= toPeriod.seq).map((p) => p.id),
    );
    const periodMeta = new Map(fiscalYearPeriods.map((p) => [p.id, p]));

    const mvRows = (await this.mvRepository.findIncomeExpense()).filter((row) => includedIds.has(row.periodId));
    const byPeriod = new Map<string, { income: Money; expense: Money }>();
    for (const row of mvRows) {
      const existing = byPeriod.get(row.periodId) ?? { income: Money.ZERO, expense: Money.ZERO };
      if (row.accountClass === "INCOME") existing.income = existing.income.add(row.creditTotal.subtract(row.debitTotal));
      else existing.expense = existing.expense.add(row.debitTotal.subtract(row.creditTotal));
      byPeriod.set(row.periodId, existing);
    }

    return [...includedIds]
      .map((periodId) => {
        const meta = periodMeta.get(periodId)!;
        const totals = byPeriod.get(periodId) ?? { income: Money.ZERO, expense: Money.ZERO };
        return {
          periodId,
          periodStartsOn: meta.startsOn,
          periodEndsOn: meta.endsOn,
          income: totals.income,
          expense: totals.expense,
          netSurplus: totals.income.subtract(totals.expense),
        };
      })
      .sort((a, b) => a.periodStartsOn.localeCompare(b.periodStartsOn));
  }
}

function bucketKeyFor(dateIso: string, bucket: CollectionTrendBucket): string {
  if (bucket === "day") return dateIso;
  const d = new Date(`${dateIso}T00:00:00Z`);
  if (bucket === "month") return dateIso.slice(0, 7);
  // 'week' — Monday of the ISO week containing dateIso, in UTC.
  const dayOfWeek = d.getUTCDay(); // 0=Sunday..6=Saturday
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

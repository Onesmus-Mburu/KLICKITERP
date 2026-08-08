import { Controller, Get, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { CollectionTrendBucket, DashboardKpisService } from "../application/dashboard-kpis.service";
import { MvRefreshService } from "../application/mv-refresh.service";
import { REPORTING_MATERIALIZED_VIEW_NAMES, ReportingMaterializedViewName } from "../infrastructure/materialized-views.repository";

/**
 * FR-DASH-002.1/FR-DASH-006.1 KPI + chart endpoints, plus
 * `POST /dashboard/refresh-mvs` (`MvRefreshService`). Every route is gated
 * by the single `dashboard:view` permission (including `refresh-mvs` — a
 * deliberate, documented scope decision: the task brief's own explicit
 * permission-code list for this pass names only `dashboard:view`, no
 * separate write-permission code for the refresh trigger; `refresh-mvs` is
 * a low-risk, idempotent, non-financial-mutating action — re-running
 * `REFRESH MATERIALIZED VIEW CONCURRENTLY` changes no business data, only
 * how current the 5 read-only views are — so reusing `dashboard:view`
 * rather than minting a narrower code was judged proportionate; a future
 * pass can split this out if that judgement call ever proves too loose).
 *
 * **FR-DASH-009.1 real-time WebSocket push is OUT OF SCOPE** — see
 * `DashboardKpisService`'s own class doc comment. Every endpoint here is a
 * plain synchronous GET/POST a client polls, the documented fallback.
 */
@ApiTags("reporting-dashboard")
@Controller("dashboard")
@RequirePermission("dashboard:view")
export class DashboardController {
  constructor(
    private readonly kpisService: DashboardKpisService,
    private readonly mvRefreshService: MvRefreshService,
  ) {}

  @Get("todays-collection")
  @ApiOperation({ summary: "FR-DASH-002.1 Today's Collection KPI — live pay_receipt/pay_receipt_split query (Phase 6 Slice 10), not mv_daily_collections" })
  async todaysCollection(): Promise<{ date: string; total: string }> {
    const result = await this.kpisService.getTodaysCollection();
    return { date: result.date, total: result.total.toDecimalString() };
  }

  @Get("outstanding-fees")
  @ApiOperation({ summary: "FR-DASH-002.1 Outstanding Fees KPI (mv_ar_summary)" })
  async outstandingFees(): Promise<{ total: string; byBucket: Record<string, string> }> {
    const result = await this.kpisService.getOutstandingFees();
    return {
      total: result.total.toDecimalString(),
      byBucket: Object.fromEntries(Object.entries(result.byBucket).map(([bucket, amount]) => [bucket, amount.toDecimalString()])),
    };
  }

  @Get("collection-rate")
  @ApiQuery({ name: "periodId", type: String })
  @ApiOperation({ summary: "Period receipts / (opening AR + net billings) — composed from gl_period_account_total, see DashboardKpisService" })
  async collectionRate(@Query("periodId") periodId: string): Promise<{
    periodId: string;
    periodReceipts: string;
    openingAr: string;
    netBillings: string;
    denominator: string;
    collectionRate: number | null;
  }> {
    const result = await this.kpisService.getCollectionRate(periodId);
    return {
      periodId: result.periodId,
      periodReceipts: result.periodReceipts.toDecimalString(),
      openingAr: result.openingAr.toDecimalString(),
      netBillings: result.netBillings.toDecimalString(),
      denominator: result.denominator.toDecimalString(),
      collectionRate: result.collectionRate,
    };
  }

  @Get("cash-flow")
  @ApiQuery({ name: "fromDate", type: String })
  @ApiQuery({ name: "toDate", type: String })
  @ApiOperation({ summary: "Delegates to the report-of-record CashFlowReport" })
  async cashFlow(@Query("fromDate") fromDate: string, @Query("toDate") toDate: string): Promise<{
    rows: Record<string, unknown>[];
    totals?: Record<string, unknown>;
  }> {
    return this.kpisService.getCashFlow(fromDate, toDate);
  }

  @Get("revenue-expense-surplus")
  @ApiQuery({ name: "periodId", type: String })
  @ApiOperation({ summary: "FR-DASH-002.1 Revenue/Expenses/Surplus KPI (mv_income_expense)" })
  async revenueExpenseSurplus(@Query("periodId") periodId: string): Promise<{ revenue: string; expense: string; surplus: string }> {
    const result = await this.kpisService.getRevenueExpenseSurplus(periodId);
    return {
      revenue: result.revenue.toDecimalString(),
      expense: result.expense.toDecimalString(),
      surplus: result.surplus.toDecimalString(),
    };
  }

  @Get("wallet-liability")
  @ApiOperation({ summary: "mv_wallet_liability — a current snapshot, not a time series" })
  async walletLiability(): Promise<{ snapshotDate: string; totalBalance: string }> {
    const result = await this.kpisService.getWalletLiability();
    return { snapshotDate: result.snapshotDate, totalBalance: result.totalBalance.toDecimalString() };
  }

  @Get("defaulters/count")
  @ApiOperation({ summary: "mv_defaulters row count" })
  async defaultersCount(): Promise<{ count: number }> {
    return { count: await this.kpisService.getDefaultersCount() };
  }

  @Get("defaulters/top")
  @ApiQuery({ name: "limit", type: Number, required: false })
  @ApiOperation({ summary: "Top N defaulters by overdue amount/days (mv_defaulters)" })
  async topDefaulters(@Query("limit") limit?: string): Promise<Record<string, unknown>[]> {
    const parsedLimit = limit ? Number(limit) : 10;
    const rows = await this.kpisService.listTopDefaulters(parsedLimit);
    return rows.map((row) => ({
      studentId: row.studentId,
      admissionNo: row.admissionNo,
      firstName: row.firstName,
      lastName: row.lastName,
      classId: row.classId,
      overdueAmount: row.overdueAmount.toDecimalString(),
      daysOverdue: row.daysOverdue,
    }));
  }

  @Get("charts/collection-trend")
  @ApiQuery({ name: "bucket", enum: ["day", "week", "month", "term"] })
  @ApiQuery({ name: "fromDate", type: String })
  @ApiQuery({ name: "toDate", type: String })
  @ApiOperation({ summary: "FR-DASH-006.1 collection trend chart" })
  async collectionTrend(
    @Query("bucket") bucket: CollectionTrendBucket,
    @Query("fromDate") fromDate: string,
    @Query("toDate") toDate: string,
  ): Promise<{ bucket: string; amount: string }[]> {
    const points = await this.kpisService.getCollectionTrendChart({ bucket, fromDate, toDate });
    return points.map((point) => ({ bucket: point.bucket, amount: point.amount.toDecimalString() }));
  }

  @Get("charts/income-vs-expense")
  @ApiQuery({ name: "fromPeriodId", type: String })
  @ApiQuery({ name: "toPeriodId", type: String })
  @ApiOperation({ summary: "FR-DASH-006.1 income vs expense chart" })
  async incomeVsExpense(
    @Query("fromPeriodId") fromPeriodId: string,
    @Query("toPeriodId") toPeriodId: string,
  ): Promise<Record<string, unknown>[]> {
    const points = await this.kpisService.getIncomeVsExpenseChart({ fromPeriodId, toPeriodId });
    return points.map((point) => ({
      periodId: point.periodId,
      periodStartsOn: point.periodStartsOn,
      periodEndsOn: point.periodEndsOn,
      income: point.income.toDecimalString(),
      expense: point.expense.toDecimalString(),
      netSurplus: point.netSurplus.toDecimalString(),
    }));
  }

  @Post("refresh-mvs")
  @ApiOperation({ summary: "Manually refresh all 5 Dashboard materialized views — no automatic cadence exists yet (see MvRefreshService)" })
  @ApiResponse({ status: 200 })
  async refreshMvs(): Promise<{ refreshed: ReportingMaterializedViewName[] }> {
    await this.mvRefreshService.refreshAll();
    return { refreshed: [...REPORTING_MATERIALIZED_VIEW_NAMES] };
  }
}

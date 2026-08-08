import { DataSource } from "typeorm";
import { DashboardKpisService } from "../application/dashboard-kpis.service";
import { CashFlowReport } from "../application/cash-flow.report";
import { MaterializedViewsRepository } from "../infrastructure/materialized-views.repository";
import { MvDailyCollectionsRow } from "../domain/mv-daily-collections.view-entity";
import { MvArSummaryRow } from "../domain/mv-ar-summary.view-entity";
import { MvIncomeExpenseRow } from "../domain/mv-income-expense.view-entity";
import { MvWalletLiabilityRow } from "../domain/mv-wallet-liability.view-entity";
import { MvDefaultersRow } from "../domain/mv-defaulters.view-entity";
import { Money } from "../../../shared/money/money";
import type { GlAccountRepository, GlPeriodAccountTotalRepository, GlPeriodRepository } from "../../../accounting";

function collectionRow(date: string, amount: number): MvDailyCollectionsRow {
  const row = new MvDailyCollectionsRow();
  row.collectionDate = date;
  row.method = "CASH";
  row.cashierId = "cashier-1";
  row.amount = Money.fromInt(amount);
  return row;
}

describe("DashboardKpisService", () => {
  let mvRepository: {
    findDailyCollections: jest.Mock;
    findArSummary: jest.Mock;
    findIncomeExpense: jest.Mock;
    findWalletLiability: jest.Mock;
    findDefaulters: jest.Mock;
  };
  let periodRepository: { findByIdOrFail: jest.Mock; listByFiscalYear: jest.Mock };
  let periodAccountTotalRepository: { listByPeriod: jest.Mock };
  let accountRepository: { findByControlDomain: jest.Mock };
  let cashFlowReport: { execute: jest.Mock };
  let dataSource: { query: jest.Mock };
  let service: DashboardKpisService;

  beforeEach(() => {
    mvRepository = {
      findDailyCollections: jest.fn(async () => []),
      findArSummary: jest.fn(async () => []),
      findIncomeExpense: jest.fn(async () => []),
      findWalletLiability: jest.fn(async () => null),
      findDefaulters: jest.fn(async () => []),
    };
    periodRepository = { findByIdOrFail: jest.fn(), listByFiscalYear: jest.fn(async () => []) };
    periodAccountTotalRepository = { listByPeriod: jest.fn(async () => []) };
    accountRepository = { findByControlDomain: jest.fn(async () => []) };
    cashFlowReport = { execute: jest.fn() };
    dataSource = { query: jest.fn(async () => [{ total: "0" }]) };

    service = new DashboardKpisService(
      mvRepository as unknown as MaterializedViewsRepository,
      periodRepository as unknown as GlPeriodRepository,
      periodAccountTotalRepository as unknown as GlPeriodAccountTotalRepository,
      accountRepository as unknown as GlAccountRepository,
      cashFlowReport as unknown as CashFlowReport,
      dataSource as unknown as DataSource,
    );
  });

  it("getTodaysCollection queries LIVE pay_receipt/pay_receipt_split (Phase 6 Slice 10) — not mv_daily_collections", async () => {
    const today = new Date().toISOString().slice(0, 10);
    dataSource.query.mockResolvedValue([{ total: "800.0000" }]);

    const result = await service.getTodaysCollection();

    expect(result.date).toBe(today);
    expect(result.total.toDecimalString()).toBe("800.0000");
    // Not the MV path at all — the real point of this fix.
    expect(mvRepository.findDailyCollections).not.toHaveBeenCalled();
    // The live query itself: POSTED-only, dated exactly today, params bound (no string concatenation).
    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain("pay_receipt_split");
    expect(sql).toContain("r.status = 'POSTED'");
    expect(sql).toContain("r.receipt_date = $1");
    expect(params).toEqual([today]);
  });

  it("getTodaysCollection returns zero when the live query finds no matching (POSTED, today-dated) receipts", async () => {
    dataSource.query.mockResolvedValue([{ total: "0" }]);
    const result = await service.getTodaysCollection();
    expect(result.total.isZero()).toBe(true);
  });

  it("getOutstandingFees sums mv_ar_summary balances with a per-bucket breakdown", async () => {
    const rowA = new MvArSummaryRow();
    rowA.classId = "class-1";
    rowA.agingBucket = "0-30";
    rowA.balance = Money.fromInt(1000);
    const rowB = new MvArSummaryRow();
    rowB.classId = "class-2";
    rowB.agingBucket = "31-60";
    rowB.balance = Money.fromInt(500);
    mvRepository.findArSummary.mockResolvedValue([rowA, rowB]);

    const result = await service.getOutstandingFees();
    expect(result.total.toDecimalString()).toBe("1500.0000");
    expect(result.byBucket["0-30"].toDecimalString()).toBe("1000.0000");
    expect(result.byBucket["31-60"].toDecimalString()).toBe("500.0000");
  });

  it("getRevenueExpenseSurplus nets INCOME (credit-debit) and EXPENSE (debit-credit) for one period", async () => {
    const income = new MvIncomeExpenseRow();
    income.periodId = "p1";
    income.periodStartsOn = "2026-01-01";
    income.periodEndsOn = "2026-01-31";
    income.accountClass = "INCOME";
    income.debitTotal = Money.ZERO;
    income.creditTotal = Money.fromInt(10000);
    const expense = new MvIncomeExpenseRow();
    expense.periodId = "p1";
    expense.periodStartsOn = "2026-01-01";
    expense.periodEndsOn = "2026-01-31";
    expense.accountClass = "EXPENSE";
    expense.debitTotal = Money.fromInt(4000);
    expense.creditTotal = Money.ZERO;
    mvRepository.findIncomeExpense.mockResolvedValue([income, expense]);

    const result = await service.getRevenueExpenseSurplus("p1");
    expect(result.revenue.toDecimalString()).toBe("10000.0000");
    expect(result.expense.toDecimalString()).toBe("4000.0000");
    expect(result.surplus.toDecimalString()).toBe("6000.0000");
  });

  it("getWalletLiability returns the MV snapshot, or a zeroed default when the MV has no row", async () => {
    const snapshot = new MvWalletLiabilityRow();
    snapshot.snapshotDate = "2026-07-20";
    snapshot.totalBalance = Money.fromInt(2500);
    mvRepository.findWalletLiability.mockResolvedValue(snapshot);
    let result = await service.getWalletLiability();
    expect(result.totalBalance.toDecimalString()).toBe("2500.0000");

    mvRepository.findWalletLiability.mockResolvedValue(null);
    result = await service.getWalletLiability();
    expect(result.totalBalance.isZero()).toBe(true);
  });

  it("getDefaultersCount/listTopDefaulters read mv_defaulters", async () => {
    const rows = [1, 2, 3].map((n) => {
      const row = new MvDefaultersRow();
      row.studentId = `s${n}`;
      row.admissionNo = `ADM-00${n}`;
      row.firstName = "A";
      row.lastName = "B";
      row.classId = "class-1";
      row.overdueAmount = Money.fromInt(n * 100);
      row.daysOverdue = n * 10;
      return row;
    });
    mvRepository.findDefaulters.mockResolvedValue(rows);

    expect(await service.getDefaultersCount()).toBe(3);
    const top2 = await service.listTopDefaulters(2);
    expect(top2).toHaveLength(2);
    expect(top2[0].studentId).toBe("s1");
  });

  it("getCollectionTrendChart buckets mv_daily_collections rows by day/week/month, filtered to the given range", async () => {
    mvRepository.findDailyCollections.mockResolvedValue([
      collectionRow("2026-01-05", 100), // Monday
      collectionRow("2026-01-06", 200), // Tuesday, same ISO week as 01-05
      collectionRow("2026-02-01", 999), // outside range below
    ]);

    const dayPoints = await service.getCollectionTrendChart({ bucket: "day", fromDate: "2026-01-01", toDate: "2026-01-31" });
    expect(dayPoints).toHaveLength(2);

    const weekPoints = await service.getCollectionTrendChart({ bucket: "week", fromDate: "2026-01-01", toDate: "2026-01-31" });
    expect(weekPoints).toHaveLength(1);
    expect(weekPoints[0].amount.toDecimalString()).toBe("300.0000");

    const monthPoints = await service.getCollectionTrendChart({ bucket: "month", fromDate: "2026-01-01", toDate: "2026-01-31" });
    expect(monthPoints).toHaveLength(1);
    expect(monthPoints[0].bucket).toBe("2026-01");
  });

  it("getCashFlow delegates directly to CashFlowReport.execute()", async () => {
    cashFlowReport.execute.mockResolvedValue({ rows: [], totals: { netCashFlow: Money.ZERO }, generatedAt: new Date() });
    await service.getCashFlow("2026-01-01", "2026-01-31");
    expect(cashFlowReport.execute).toHaveBeenCalledWith({ fromDate: "2026-01-01", toDate: "2026-01-31" });
  });
});

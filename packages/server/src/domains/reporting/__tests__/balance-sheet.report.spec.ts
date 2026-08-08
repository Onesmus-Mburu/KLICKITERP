import { BalanceSheetReport } from "../application/balance-sheet.report";
import { Money } from "../../../shared/money/money";
import type { GlAccountEntity, GlPeriodAccountTotalEntity, GlPeriodEntity } from "../../../accounting";

function makeAccount(overrides: Partial<GlAccountEntity>): GlAccountEntity {
  return { id: "acc", code: "0000", name: "Account", class: "ASSET", isPostable: true, ...overrides } as GlAccountEntity;
}

function makeTotalRow(overrides: Partial<GlPeriodAccountTotalEntity>): GlPeriodAccountTotalEntity {
  return {
    periodId: "period-1",
    accountId: "acc",
    costCenterId: null,
    debitTotal: Money.ZERO,
    creditTotal: Money.ZERO,
    ...overrides,
  } as GlPeriodAccountTotalEntity;
}

const PERIOD_1 = { id: "period-1", fiscalYearId: "fy-1", seq: 1 } as GlPeriodEntity;
const PERIOD_2 = { id: "period-2", fiscalYearId: "fy-1", seq: 2 } as GlPeriodEntity;

const ACCOUNTS: GlAccountEntity[] = [
  makeAccount({ id: "acc-cash", code: "1010", name: "Petty Cash", class: "ASSET", isPostable: true }),
  makeAccount({ id: "acc-loan", code: "2000", name: "Bank Loan", class: "LIABILITY", isPostable: true }),
  makeAccount({ id: "acc-equity", code: "3000", name: "Capital", class: "EQUITY", isPostable: true }),
  makeAccount({ id: "acc-income", code: "4000", name: "Fee Income", class: "INCOME", isPostable: true }),
];

const PERIOD_1_ROWS: GlPeriodAccountTotalEntity[] = [
  makeTotalRow({ periodId: "period-1", accountId: "acc-cash", debitTotal: Money.fromInt(1000), creditTotal: Money.ZERO }),
  makeTotalRow({ periodId: "period-1", accountId: "acc-loan", debitTotal: Money.ZERO, creditTotal: Money.fromInt(400) }),
  makeTotalRow({ periodId: "period-1", accountId: "acc-equity", debitTotal: Money.ZERO, creditTotal: Money.fromInt(600) }),
];
const PERIOD_2_ROWS: GlPeriodAccountTotalEntity[] = [
  makeTotalRow({ periodId: "period-2", accountId: "acc-cash", debitTotal: Money.fromInt(200), creditTotal: Money.ZERO }),
  makeTotalRow({ periodId: "period-2", accountId: "acc-loan", debitTotal: Money.ZERO, creditTotal: Money.fromInt(100) }),
];

describe("BalanceSheetReport", () => {
  let periodRepository: { findByIdOrFail: jest.Mock; listByFiscalYear: jest.Mock };
  let accountRepository: { list: jest.Mock };
  let periodAccountTotalRepository: { listByPeriod: jest.Mock };
  let report: BalanceSheetReport;

  beforeEach(() => {
    periodRepository = {
      findByIdOrFail: jest.fn(),
      listByFiscalYear: jest.fn(async () => [PERIOD_1, PERIOD_2]),
    };
    accountRepository = { list: jest.fn(async () => ACCOUNTS) };
    periodAccountTotalRepository = {
      listByPeriod: jest.fn(async (periodId: string) => (periodId === "period-1" ? PERIOD_1_ROWS : PERIOD_2_ROWS)),
    };
    report = new BalanceSheetReport(periodRepository as never, accountRepository as never, periodAccountTotalRepository as never);
  });

  it("sums ONLY the given period's own movement when asOf is the first period in the fiscal year (nothing to accumulate before it)", async () => {
    periodRepository.findByIdOrFail.mockResolvedValue(PERIOD_1);

    const result = await report.execute({ periodId: "period-1" });

    const cash = result.rows.find((r) => r.accountCode === "1010")!;
    const loan = result.rows.find((r) => r.accountCode === "2000")!;
    expect((cash.balance as Money).toDecimalString()).toBe("1000.0000");
    expect((loan.balance as Money).toDecimalString()).toBe("400.0000");
    // INCOME class is excluded entirely — balance sheet is ASSET/LIABILITY/EQUITY only.
    expect(result.rows.some((r) => r.accountCode === "4000")).toBe(false);
  });

  it("CUMULATIVE range: asOf=period-2 sums period-1 AND period-2 together — the distinguishing behavior from IncomeStatementReport's bounded range", async () => {
    periodRepository.findByIdOrFail.mockResolvedValue(PERIOD_2);

    const result = await report.execute({ periodId: "period-2" });

    const cash = result.rows.find((r) => r.accountCode === "1010")!;
    const loan = result.rows.find((r) => r.accountCode === "2000")!;
    const equity = result.rows.find((r) => r.accountCode === "3000")!;
    // 1000 (period 1) + 200 (period 2) = 1200 — cumulative, not just period 2's own 200.
    expect((cash.balance as Money).toDecimalString()).toBe("1200.0000");
    // 400 + 100 = 500, credit-normal (LIABILITY).
    expect((loan.balance as Money).toDecimalString()).toBe("500.0000");
    // Equity had no period-2 movement — still carries its period-1 cumulative balance forward.
    expect((equity.balance as Money).toDecimalString()).toBe("600.0000");

    const totals = result.totals as { totalAssets: Money; totalLiabilities: Money; totalEquity: Money; difference: Money };
    expect(totals.totalAssets.toDecimalString()).toBe("1200.0000");
    expect(totals.totalLiabilities.toDecimalString()).toBe("500.0000");
    expect(totals.totalEquity.toDecimalString()).toBe("600.0000");
    // 1200 - (500 + 600) = 100 — deliberately unbalanced synthetic fixture, still surfaced visibly.
    expect(totals.difference.toDecimalString()).toBe("100.0000");
  });

  it("queries listByPeriod only for periods with seq <= the target period's seq", async () => {
    periodRepository.findByIdOrFail.mockResolvedValue(PERIOD_1);
    await report.execute({ periodId: "period-1" });
    expect(periodAccountTotalRepository.listByPeriod).toHaveBeenCalledTimes(1);
    expect(periodAccountTotalRepository.listByPeriod).toHaveBeenCalledWith("period-1");
  });
});

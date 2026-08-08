import { IncomeStatementReport } from "../application/income-statement.report";
import { Money } from "../../../shared/money/money";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import type { GlAccountEntity, GlPeriodAccountTotalEntity, GlPeriodEntity } from "../../../accounting";

function makeAccount(overrides: Partial<GlAccountEntity>): GlAccountEntity {
  return { id: "acc", code: "0000", name: "Account", class: "INCOME", isPostable: true, ...overrides } as GlAccountEntity;
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
const PERIOD_3_OTHER_YEAR = { id: "period-3", fiscalYearId: "fy-2", seq: 1 } as GlPeriodEntity;

const ACCOUNTS: GlAccountEntity[] = [
  makeAccount({ id: "acc-income", code: "4000", name: "Fee Income", class: "INCOME", isPostable: true }),
  makeAccount({ id: "acc-expense", code: "5000", name: "Salaries Expense", class: "EXPENSE", isPostable: true }),
  makeAccount({ id: "acc-cash", code: "1010", name: "Petty Cash", class: "ASSET", isPostable: true }),
];

const PERIOD_1_ROWS: GlPeriodAccountTotalEntity[] = [
  makeTotalRow({ periodId: "period-1", accountId: "acc-income", debitTotal: Money.ZERO, creditTotal: Money.fromInt(1000) }),
  makeTotalRow({ periodId: "period-1", accountId: "acc-expense", debitTotal: Money.fromInt(300), creditTotal: Money.ZERO }),
];
const PERIOD_2_ROWS: GlPeriodAccountTotalEntity[] = [
  makeTotalRow({ periodId: "period-2", accountId: "acc-income", debitTotal: Money.ZERO, creditTotal: Money.fromInt(500) }),
  makeTotalRow({ periodId: "period-2", accountId: "acc-expense", debitTotal: Money.fromInt(100), creditTotal: Money.ZERO }),
];

function periodById(id: string): GlPeriodEntity {
  if (id === "period-1") return PERIOD_1;
  if (id === "period-2") return PERIOD_2;
  if (id === "period-3") return PERIOD_3_OTHER_YEAR;
  throw new Error(`unexpected period id in test fixture: ${id}`);
}

describe("IncomeStatementReport", () => {
  let periodRepository: { findByIdOrFail: jest.Mock; listByFiscalYear: jest.Mock };
  let accountRepository: { list: jest.Mock };
  let periodAccountTotalRepository: { listByPeriod: jest.Mock };
  let report: IncomeStatementReport;

  beforeEach(() => {
    periodRepository = {
      findByIdOrFail: jest.fn(async (id: string) => periodById(id)),
      listByFiscalYear: jest.fn(async () => [PERIOD_1, PERIOD_2]),
    };
    accountRepository = { list: jest.fn(async () => ACCOUNTS) };
    periodAccountTotalRepository = {
      listByPeriod: jest.fn(async (periodId: string) => (periodId === "period-1" ? PERIOD_1_ROWS : PERIOD_2_ROWS)),
    };
    report = new IncomeStatementReport(periodRepository as never, accountRepository as never, periodAccountTotalRepository as never);
  });

  it("sums across the full range when from != to (both periods included)", async () => {
    const result = await report.execute({ fromPeriodId: "period-1", toPeriodId: "period-2" });

    const income = result.rows.find((r) => r.accountCode === "4000")!;
    const expense = result.rows.find((r) => r.accountCode === "5000")!;
    expect((income.amount as Money).toDecimalString()).toBe("1500.0000"); // 1000 + 500
    expect((expense.amount as Money).toDecimalString()).toBe("400.0000"); // 300 + 100
    // ASSET is excluded entirely — income statement is INCOME/EXPENSE only.
    expect(result.rows.some((r) => r.accountCode === "1010")).toBe(false);

    const totals = result.totals as { totalIncome: Money; totalExpense: Money; netIncome: Money };
    expect(totals.totalIncome.toDecimalString()).toBe("1500.0000");
    expect(totals.totalExpense.toDecimalString()).toBe("400.0000");
    expect(totals.netIncome.toDecimalString()).toBe("1100.0000");
  });

  it("PERIOD-RANGE ONLY, not cumulative: from=to=period-2 sums ONLY period 2's own movement, unlike BalanceSheetReport's cumulative-from-year-start design", async () => {
    const result = await report.execute({ fromPeriodId: "period-2", toPeriodId: "period-2" });

    const income = result.rows.find((r) => r.accountCode === "4000")!;
    const expense = result.rows.find((r) => r.accountCode === "5000")!;
    // Only period 2's own 500/100 — period 1's 1000/300 must NOT be folded in.
    expect((income.amount as Money).toDecimalString()).toBe("500.0000");
    expect((expense.amount as Money).toDecimalString()).toBe("100.0000");
  });

  it("rejects a range spanning two different fiscal years with ValidationException", async () => {
    await expect(report.execute({ fromPeriodId: "period-1", toPeriodId: "period-3" })).rejects.toThrow(ValidationException);
  });

  it("rejects fromPeriodId after toPeriodId with ValidationException", async () => {
    await expect(report.execute({ fromPeriodId: "period-2", toPeriodId: "period-1" })).rejects.toThrow(ValidationException);
  });
});

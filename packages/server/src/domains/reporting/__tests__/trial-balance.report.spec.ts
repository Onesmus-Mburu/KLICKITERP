import { TrialBalanceReport } from "../application/trial-balance.report";
import { Money } from "../../../shared/money/money";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
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

describe("TrialBalanceReport", () => {
  let periodRepository: { findByIdOrFail: jest.Mock };
  let accountRepository: { list: jest.Mock };
  let periodAccountTotalRepository: { listByPeriod: jest.Mock };
  let report: TrialBalanceReport;

  beforeEach(() => {
    periodRepository = { findByIdOrFail: jest.fn(async () => ({ id: "period-1" }) as GlPeriodEntity) };
    accountRepository = { list: jest.fn(async () => []) };
    periodAccountTotalRepository = { listByPeriod: jest.fn(async () => []) };
    report = new TrialBalanceReport(periodRepository as never, accountRepository as never, periodAccountTotalRepository as never);
  });

  it("sums debit/credit per account across cost centers, excludes non-postable accounts, and reports balanced=true when totals agree", async () => {
    accountRepository.list.mockResolvedValue([
      makeAccount({ id: "acc-cash", code: "1010", name: "Petty Cash", class: "ASSET", isPostable: true }),
      makeAccount({ id: "acc-income", code: "4000", name: "Fee Income", class: "INCOME", isPostable: true }),
      makeAccount({ id: "acc-header", code: "1000", name: "Assets", class: "ASSET", isPostable: false }),
    ]);
    periodAccountTotalRepository.listByPeriod.mockResolvedValue([
      makeTotalRow({ accountId: "acc-cash", costCenterId: null, debitTotal: Money.fromInt(1000), creditTotal: Money.ZERO }),
      makeTotalRow({ accountId: "acc-cash", costCenterId: "cc-2", debitTotal: Money.fromInt(500), creditTotal: Money.ZERO }),
      makeTotalRow({ accountId: "acc-income", costCenterId: null, debitTotal: Money.ZERO, creditTotal: Money.fromInt(1500) }),
    ]);

    const result = await report.execute({ periodId: "period-1" });

    expect(result.rows).toHaveLength(2); // header excluded
    const cashRow = result.rows.find((r) => r.accountCode === "1010")!;
    expect((cashRow.debit as Money).toDecimalString()).toBe("1500.0000");
    expect((cashRow.credit as Money).toDecimalString()).toBe("0.0000");

    const incomeRow = result.rows.find((r) => r.accountCode === "4000")!;
    expect((incomeRow.credit as Money).toDecimalString()).toBe("1500.0000");

    expect(periodRepository.findByIdOrFail).toHaveBeenCalledWith("period-1");
    const totals = result.totals as { debit: Money; credit: Money; difference: Money; balanced: boolean };
    expect(totals.debit.toDecimalString()).toBe("1500.0000");
    expect(totals.credit.toDecimalString()).toBe("1500.0000");
    expect(totals.difference.isZero()).toBe(true);
    expect(totals.balanced).toBe(true);
  });

  it("surfaces a genuine imbalance as a visible computed totals field, never a thrown error", async () => {
    accountRepository.list.mockResolvedValue([
      makeAccount({ id: "acc-cash", code: "1010", class: "ASSET", isPostable: true }),
      makeAccount({ id: "acc-income", code: "4000", class: "INCOME", isPostable: true }),
    ]);
    periodAccountTotalRepository.listByPeriod.mockResolvedValue([
      makeTotalRow({ accountId: "acc-cash", debitTotal: Money.fromInt(1500), creditTotal: Money.ZERO }),
      // Only 1400 credited back — a deliberately unbalanced synthetic fixture.
      makeTotalRow({ accountId: "acc-income", debitTotal: Money.ZERO, creditTotal: Money.fromInt(1400) }),
    ]);

    const result = await report.execute({ periodId: "period-1" });

    const totals = result.totals as { difference: Money; balanced: boolean };
    expect(totals.balanced).toBe(false);
    expect(totals.difference.toDecimalString()).toBe("100.0000");
  });

  it("propagates NotFoundException when the period does not exist", async () => {
    periodRepository.findByIdOrFail.mockRejectedValue(new NotFoundException("GlPeriod", "missing-period"));
    accountRepository.list.mockResolvedValue([]);

    await expect(report.execute({ periodId: "missing-period" })).rejects.toThrow(NotFoundException);
  });
});

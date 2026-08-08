import { PayrollSummaryReport } from "../application/payroll-summary.report";
import { Money } from "../../../shared/money/money";
import type { PyrlRunEntity, PyrlRunLineEntity, PyrlRunLineRepository, PyrlRunRepository } from "../../payroll";

function line(overrides: Partial<PyrlRunLineEntity>): PyrlRunLineEntity {
  return {
    id: "line",
    runId: "run-1",
    employeeId: "emp",
    gross: Money.ZERO,
    taxable: Money.ZERO,
    paye: Money.ZERO,
    nssfEmployee: Money.ZERO,
    nssfEmployer: Money.ZERO,
    shif: Money.ZERO,
    ahlEmployee: Money.ZERO,
    ahlEmployer: Money.ZERO,
    loanRecovered: Money.ZERO,
    otherDeductions: Money.ZERO,
    netPay: Money.ZERO,
    ...overrides,
  } as PyrlRunLineEntity;
}

describe("PayrollSummaryReport", () => {
  let runRepository: { findByIdOrFail: jest.Mock };
  let runLineRepository: { findByRunId: jest.Mock };
  let report: PayrollSummaryReport;

  beforeEach(() => {
    runRepository = {
      findByIdOrFail: jest.fn(async () => ({ id: "run-1", periodKey: "2026-01", status: "COMMITTED" }) as PyrlRunEntity),
    };
    runLineRepository = { findByRunId: jest.fn(async () => []) };
    report = new PayrollSummaryReport(runRepository as unknown as PyrlRunRepository, runLineRepository as unknown as PyrlRunLineRepository);
  });

  it("sums every component across the run's lines into one row per component", async () => {
    runLineRepository.findByRunId.mockResolvedValue([
      line({ gross: Money.fromInt(50000), paye: Money.fromInt(8000), nssfEmployee: Money.fromInt(2160), netPay: Money.fromInt(38000) }),
      line({ gross: Money.fromInt(30000), paye: Money.fromInt(3000), nssfEmployee: Money.fromInt(1200), netPay: Money.fromInt(24500) }),
    ]);

    const result = await report.execute({ runId: "run-1" });

    expect(result.rows).toHaveLength(11);
    const byComponent = new Map((result.rows as Array<{ component: string; amount: Money }>).map((r) => [r.component, r.amount]));
    expect(byComponent.get("Gross")!.toDecimalString()).toBe("80000.0000");
    expect(byComponent.get("PAYE")!.toDecimalString()).toBe("11000.0000");
    expect(byComponent.get("NSSF Employee")!.toDecimalString()).toBe("3360.0000");
    expect(byComponent.get("Net Pay")!.toDecimalString()).toBe("62500.0000");

    const totals = result.totals as { gross: Money; netPay: Money; employeeCount: number; periodKey: string; runStatus: string };
    expect(totals.gross.toDecimalString()).toBe("80000.0000");
    expect(totals.netPay.toDecimalString()).toBe("62500.0000");
    expect(totals.employeeCount).toBe(2);
    expect(totals.periodKey).toBe("2026-01");
    expect(totals.runStatus).toBe("COMMITTED");
  });

  it("returns all-zero totals for a run with no lines", async () => {
    const result = await report.execute({ runId: "run-1" });
    const totals = result.totals as { gross: Money; employeeCount: number };
    expect(totals.gross.isZero()).toBe(true);
    expect(totals.employeeCount).toBe(0);
  });
});

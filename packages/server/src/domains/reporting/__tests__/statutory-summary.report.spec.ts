import { StatutorySummaryReport } from "../application/statutory-summary.report";
import { Money } from "../../../shared/money/money";
import type { PyrlRunEntity, PyrlRunLineEntity, PyrlRunLineRepository, PyrlRunRepository } from "../../payroll";

function line(overrides: Partial<PyrlRunLineEntity>): PyrlRunLineEntity {
  return {
    id: "line",
    runId: "run-1",
    employeeId: "emp",
    paye: Money.ZERO,
    nssfEmployee: Money.ZERO,
    nssfEmployer: Money.ZERO,
    shif: Money.ZERO,
    ahlEmployee: Money.ZERO,
    ahlEmployer: Money.ZERO,
    ...overrides,
  } as PyrlRunLineEntity;
}

describe("StatutorySummaryReport", () => {
  let runRepository: { findByIdOrFail: jest.Mock };
  let runLineRepository: { findByRunId: jest.Mock };
  let report: StatutorySummaryReport;

  beforeEach(() => {
    runRepository = {
      findByIdOrFail: jest.fn(async () => ({ id: "run-1", periodKey: "2026-01", status: "COMMITTED" }) as PyrlRunEntity),
    };
    runLineRepository = { findByRunId: jest.fn(async () => []) };
    report = new StatutorySummaryReport(runRepository as unknown as PyrlRunRepository, runLineRepository as unknown as PyrlRunLineRepository);
  });

  it("aggregates PAYE/NSSF/SHIF/AHL into 4 rows with employee/employer legs, PAYE/SHIF employer always zero", async () => {
    runLineRepository.findByRunId.mockResolvedValue([
      line({ paye: Money.fromInt(8000), nssfEmployee: Money.fromInt(2160), nssfEmployer: Money.fromInt(2160), shif: Money.fromInt(1375), ahlEmployee: Money.fromInt(750), ahlEmployer: Money.fromInt(750) }),
      line({ paye: Money.fromInt(3000), nssfEmployee: Money.fromInt(1200), nssfEmployer: Money.fromInt(1200), shif: Money.fromInt(825), ahlEmployee: Money.fromInt(450), ahlEmployer: Money.fromInt(450) }),
    ]);

    const result = await report.execute({ runId: "run-1" });

    expect(result.rows).toHaveLength(4);
    const byType = new Map((result.rows as Array<{ statutoryType: string; employeeAmount: Money; employerAmount: Money; total: Money }>).map((r) => [r.statutoryType, r]));
    expect(byType.get("PAYE")!.employeeAmount.toDecimalString()).toBe("11000.0000");
    expect(byType.get("PAYE")!.employerAmount.isZero()).toBe(true);
    expect(byType.get("NSSF")!.total.toDecimalString()).toBe("6720.0000"); // 2160+2160+1200+1200
    expect(byType.get("SHIF")!.employeeAmount.toDecimalString()).toBe("2200.0000");
    expect(byType.get("AHL")!.total.toDecimalString()).toBe("2400.0000"); // 750+750+450+450

    const totals = result.totals as { totalRemittance: Money; employeeCount: number };
    expect(totals.totalRemittance.toDecimalString()).toBe("22320.0000"); // 11000 + 6720 + 2200 + 2400
    expect(totals.employeeCount).toBe(2);
  });
});

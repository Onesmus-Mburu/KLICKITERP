import { Injectable } from "@nestjs/common";
import { PyrlRunLineRepository, PyrlRunRepository } from "../../payroll";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface StatutorySummaryParams {
  runId: string;
}

/**
 * **Documented STAND-IN, not a real statutory filing output.** FR-PYRL-009.1
 * describes generating the actual P10 (PAYE)/NSSF/SHIF/AHL filing-FORMAT
 * documents iTax/NSSF/SHIF/AHL's own portals expect — `PyrlRunsService.file()`
 * (Module 15) already documents that gap explicitly ("does NOT generate real
 * P10/NSSF/SHIF/AHL filing documents... deferred to Module 18/Reporting
 * Engine, not built yet"). This report closes the "real FIGURES" half of
 * that gap only — real PAYE/NSSF/SHIF/AHL totals for a payroll run, summed
 * straight from `pyrl_run_line` (the same source of truth
 * `PayrollSummaryReport` and the run's own `pyrl_run.totals` snapshot use) —
 * the exact iTax/NSSF/SHIF/AHL portal file LAYOUTS (column order, header
 * rows, fixed-width vs. CSV-per-agency, digital signature requirements)
 * remain entirely out of scope, same honesty standard as this codebase's
 * other "real figures, not real file format" gaps (Payroll's own statutory
 * RATE seed disclaimer — `docs/phase-5/PROGRESS.md`'s Module 15 row — is the
 * closest precedent).
 *
 * `rows` is one row per statutory scheme (PAYE/NSSF/SHIF/AHL), each carrying
 * its employee- and employer-borne portions (PAYE/SHIF have no employer
 * leg in this schema — `employerAmount` is `Money.ZERO` for those rows,
 * never omitted, so every row has the same shape for a uniform CSV export).
 * `totals.totalRemittance` is the single figure a finance officer would
 * actually wire to KRA/NSSF/SHIF/the Affordable Housing Levy collector.
 */
@Injectable()
export class StatutorySummaryReport implements ReportDefinition<StatutorySummaryParams> {
  readonly code = "statutory-summary";
  readonly name = "Statutory Summary (PAYE/NSSF/SHIF/AHL) — figures only, not a filing-format output";
  readonly domain = "payroll";
  readonly permissionCode = "reports:statutory-summary:view";
  readonly paramsShape = { runId: "uuid" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "statutoryType", label: "Statutory Scheme", type: "string" },
    { key: "employeeAmount", label: "Employee Portion", type: "money" },
    { key: "employerAmount", label: "Employer Portion", type: "money" },
    { key: "total", label: "Total", type: "money" },
  ];

  constructor(
    private readonly runRepository: PyrlRunRepository,
    private readonly runLineRepository: PyrlRunLineRepository,
  ) {}

  async execute(params: StatutorySummaryParams): Promise<ReportResult> {
    const run = await this.runRepository.findByIdOrFail(params.runId);
    const lines = await this.runLineRepository.findByRunId(params.runId);

    let paye = Money.ZERO;
    let nssfEmployee = Money.ZERO;
    let nssfEmployer = Money.ZERO;
    let shif = Money.ZERO;
    let ahlEmployee = Money.ZERO;
    let ahlEmployer = Money.ZERO;
    for (const line of lines) {
      paye = paye.add(line.paye);
      nssfEmployee = nssfEmployee.add(line.nssfEmployee);
      nssfEmployer = nssfEmployer.add(line.nssfEmployer);
      shif = shif.add(line.shif);
      ahlEmployee = ahlEmployee.add(line.ahlEmployee);
      ahlEmployer = ahlEmployer.add(line.ahlEmployer);
    }

    const rows = [
      { statutoryType: "PAYE", employeeAmount: paye, employerAmount: Money.ZERO, total: paye },
      {
        statutoryType: "NSSF",
        employeeAmount: nssfEmployee,
        employerAmount: nssfEmployer,
        total: nssfEmployee.add(nssfEmployer),
      },
      { statutoryType: "SHIF", employeeAmount: shif, employerAmount: Money.ZERO, total: shif },
      {
        statutoryType: "AHL",
        employeeAmount: ahlEmployee,
        employerAmount: ahlEmployer,
        total: ahlEmployee.add(ahlEmployer),
      },
    ];

    const totalRemittance = rows.reduce((sum, row) => sum.add(row.total), Money.ZERO);

    return {
      rows,
      totals: {
        totalRemittance,
        employeeCount: lines.length,
        periodKey: run.periodKey,
        runStatus: run.status,
      },
      generatedAt: new Date(),
    };
  }
}

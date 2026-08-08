import { Injectable } from "@nestjs/common";
import { PyrlRunLineRepository, PyrlRunRepository } from "../../payroll";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface PayrollSummaryParams {
  runId: string;
}

interface ComponentTotals {
  gross: Money;
  taxable: Money;
  paye: Money;
  nssfEmployee: Money;
  nssfEmployer: Money;
  shif: Money;
  ahlEmployee: Money;
  ahlEmployer: Money;
  loanRecovered: Money;
  otherDeductions: Money;
  netPay: Money;
}

/**
 * FR-RPT-008-adjacent report-of-record — a SUMMARY ROLLUP of `pyrl_run_line`
 * for one `pyrl_run`, per the task brief's explicit "a summary rollup, not
 * a full payslip-per-employee dump" scope (a per-employee payslip listing
 * is `PyrlRunLineRepository.findByRunId()`'s own already-existing consumer
 * in `domains/payroll`, not something this report re-implements).
 *
 * `rows` is one row PER COMPONENT (Gross/Taxable/PAYE/NSSF Employee/NSSF
 * Employer/SHIF/AHL Employee/AHL Employer/Loan Recovered/Other Deductions/
 * Net Pay), each summed across every `pyrl_run_line` belonging to the run —
 * a pivoted "breakdown table" shape that reads naturally both on-screen and
 * exported to CSV, the same "one row per bucket, not one row per source
 * record" shape `StatutorySummaryReport`/`AgingOutstandingReport` use.
 * `totals` repeats the same figures as a flat, keyed object (plus
 * `employeeCount`/`periodKey`/`runStatus`) for a caller that wants the
 * numbers without walking `rows`.
 */
@Injectable()
export class PayrollSummaryReport implements ReportDefinition<PayrollSummaryParams> {
  readonly code = "payroll-summary";
  readonly name = "Payroll Summary";
  readonly domain = "payroll";
  readonly permissionCode = "reports:payroll-summary:view";
  readonly paramsShape = { runId: "uuid" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "component", label: "Component", type: "string" },
    { key: "amount", label: "Amount", type: "money" },
  ];

  constructor(
    private readonly runRepository: PyrlRunRepository,
    private readonly runLineRepository: PyrlRunLineRepository,
  ) {}

  async execute(params: PayrollSummaryParams): Promise<ReportResult> {
    const run = await this.runRepository.findByIdOrFail(params.runId);
    const lines = await this.runLineRepository.findByRunId(params.runId);

    const totals: ComponentTotals = lines.reduce<ComponentTotals>(
      (sum, line) => ({
        gross: sum.gross.add(line.gross),
        taxable: sum.taxable.add(line.taxable),
        paye: sum.paye.add(line.paye),
        nssfEmployee: sum.nssfEmployee.add(line.nssfEmployee),
        nssfEmployer: sum.nssfEmployer.add(line.nssfEmployer),
        shif: sum.shif.add(line.shif),
        ahlEmployee: sum.ahlEmployee.add(line.ahlEmployee),
        ahlEmployer: sum.ahlEmployer.add(line.ahlEmployer),
        loanRecovered: sum.loanRecovered.add(line.loanRecovered),
        otherDeductions: sum.otherDeductions.add(line.otherDeductions),
        netPay: sum.netPay.add(line.netPay),
      }),
      {
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
      },
    );

    const rows = [
      { component: "Gross", amount: totals.gross },
      { component: "Taxable", amount: totals.taxable },
      { component: "PAYE", amount: totals.paye },
      { component: "NSSF Employee", amount: totals.nssfEmployee },
      { component: "NSSF Employer", amount: totals.nssfEmployer },
      { component: "SHIF", amount: totals.shif },
      { component: "AHL Employee", amount: totals.ahlEmployee },
      { component: "AHL Employer", amount: totals.ahlEmployer },
      { component: "Loan Recovered", amount: totals.loanRecovered },
      { component: "Other Deductions", amount: totals.otherDeductions },
      { component: "Net Pay", amount: totals.netPay },
    ];

    return {
      rows,
      totals: { ...totals, employeeCount: lines.length, periodKey: run.periodKey, runStatus: run.status },
      generatedAt: new Date(),
    };
  }
}

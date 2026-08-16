/**
 * Phase 6 Slice 22 Part 6 (Payroll, Module 15) — local TypeScript shapes for
 * `PyrlRunResponseDto.totals`/`.varianceReport`, both `Record<string,
 * unknown>` on the wire (deliberately loose server-side — `payroll-run.dto.ts`
 * types both `@ApiProperty({ type: "object", additionalProperties: true })`,
 * no fixed OpenAPI shape exists for either, confirmed by reading the DTO
 * directly). There is nothing for codegen to get right or wrong here since
 * the backend itself never types them precisely — these interfaces are a
 * word-for-word mirror of the REAL runtime shape
 * `PayrollRunsService` actually produces
 * (`packages/server/src/domains/payroll/application/payroll-runs.service.ts`:
 * `PyrlRunTotals` lines 72-85, `PyrlRunVarianceReport` lines 97-104), not
 * guessed.
 */

export interface PyrlRunTotals {
  employeeCount: number;
  totalGross: string;
  totalTaxable: string;
  totalPaye: string;
  totalNssfEmployee: string;
  totalNssfEmployer: string;
  totalShif: string;
  totalAhlEmployee: string;
  totalAhlEmployer: string;
  totalLoanRecovered: string;
  totalOtherDeductions: string;
  totalNetPay: string;
}

const MONEY_TOTAL_KEYS: (keyof Omit<PyrlRunTotals, "employeeCount">)[] = [
  "totalGross",
  "totalTaxable",
  "totalPaye",
  "totalNssfEmployee",
  "totalNssfEmployer",
  "totalShif",
  "totalAhlEmployee",
  "totalAhlEmployer",
  "totalLoanRecovered",
  "totalOtherDeductions",
  "totalNetPay",
];

/**
 * `totals` is a genuinely empty `{}` before the run's first `compute()` call
 * (`createRun()`, `payroll-runs.service.ts:305`) — returns `null` for that
 * case (and for a missing/malformed value) rather than fabricating zeroed
 * figures that would misleadingly look like a real, computed zero-employee
 * run. Every present field is runtime-checked before use — a partially
 * malformed jsonb blob degrades individual fields to `"0.0000"`/`0` rather
 * than throwing.
 */
export function asRunTotals(totals: Record<string, unknown> | null | undefined): PyrlRunTotals | null {
  if (!totals || Object.keys(totals).length === 0) return null;

  const result = {
    employeeCount: typeof totals.employeeCount === "number" ? totals.employeeCount : 0,
  } as PyrlRunTotals;
  for (const key of MONEY_TOTAL_KEYS) {
    const value = totals[key];
    result[key] = typeof value === "string" ? value : "0.0000";
  }
  return result;
}

export interface PyrlRunVarianceEntry {
  employeeId: string;
  priorGross: string;
  currentGross: string;
  priorNetPay: string;
  currentNetPay: string;
  reasons: string[];
}

export interface PyrlRunVarianceReport {
  priorRunId: string | null;
  priorPeriodKey: string | null;
  comparedAt: string;
  flagged: PyrlRunVarianceEntry[];
  newEmployeeIds: string[];
  removedEmployeeIds: string[];
}

/**
 * `varianceReport` is `null` until `review()` first runs (`createRun()`
 * seeds it `null`, only `review()` ever populates it). When no prior
 * COMMITTED MAIN run exists to compare against (first-ever run for a
 * period, or a gap), `priorRunId`/`priorPeriodKey` are genuinely `null` and
 * EVERY current employee lands in `newEmployeeIds` instead of `flagged` —
 * `run-variance-report.tsx` renders a dedicated "no prior run available"
 * message for that real case rather than an empty/broken table.
 */
export function asVarianceReport(report: Record<string, unknown> | null | undefined): PyrlRunVarianceReport | null {
  if (!report) return null;
  const r = report as Partial<Record<keyof PyrlRunVarianceReport, unknown>>;
  return {
    priorRunId: typeof r.priorRunId === "string" ? r.priorRunId : null,
    priorPeriodKey: typeof r.priorPeriodKey === "string" ? r.priorPeriodKey : null,
    comparedAt: typeof r.comparedAt === "string" ? r.comparedAt : "",
    flagged: Array.isArray(r.flagged) ? (r.flagged as PyrlRunVarianceEntry[]) : [],
    newEmployeeIds: Array.isArray(r.newEmployeeIds) ? (r.newEmployeeIds as string[]) : [],
    removedEmployeeIds: Array.isArray(r.removedEmployeeIds) ? (r.removedEmployeeIds as string[]) : [],
  };
}

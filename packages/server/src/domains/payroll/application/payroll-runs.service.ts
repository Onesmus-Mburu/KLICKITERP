import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ApprovalEngineService } from "../../../platform/approvals";
import { SettingsService } from "../../../platform/settings";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { GlAccountRepository, PostingService } from "../../../accounting";
import {
  EMPLOYER_STATUTORY_CONTRIBUTIONS_EXPENSE_ACCOUNT_CODE,
  AHL_PAYABLE_ACCOUNT_CODE,
  NSSF_PAYABLE_ACCOUNT_CODE,
  OTHER_PAYROLL_DEDUCTIONS_PAYABLE_ACCOUNT_CODE,
  PAYE_PAYABLE_ACCOUNT_CODE,
  PAYROLL_EXPENSE_ACCOUNT_CODE,
  SHIF_PAYABLE_ACCOUNT_CODE,
  STAFF_LOANS_RECEIVABLE_ACCOUNT_CODE,
  resolveBankDisbursementAccount,
  resolveNetPayPayableAccount,
  resolvePayrollAccountByCode,
} from "./gl-payroll-accounts.util";
import { resolveComponentAmount, StructureComponentFormula } from "./salary-structures.service";
import { StatutoryCalculationService } from "./statutory-calculation.service";
import { LoansService } from "./loans.service";
import { PyrlComponentEntity, PyrlComponentKind } from "../domain/pyrl-component.entity";
import { PyrlRunEntity, PyrlRunKind, PyrlRunStatus } from "../domain/pyrl-run.entity";
import { PyrlRunLineEntity, PyrlRunLinePaidVia } from "../domain/pyrl-run-line.entity";
import { PyrlComponentRepository } from "../infrastructure/pyrl-component.repository";
import { PyrlEmployeeAssignmentRepository } from "../infrastructure/pyrl-employee-assignment.repository";
import { PyrlEmployeeComponentRepository } from "../infrastructure/pyrl-employee-component.repository";
import { PyrlEmployeeRepository } from "../infrastructure/pyrl-employee.repository";
import { PyrlLoanRepository } from "../infrastructure/pyrl-loan.repository";
import { PyrlLoanScheduleRepository } from "../infrastructure/pyrl-loan-schedule.repository";
import { PyrlOneoffRepository } from "../infrastructure/pyrl-oneoff.repository";
import { PyrlRunLineComponentRepository } from "../infrastructure/pyrl-run-line-component.repository";
import { PyrlRunLineLoanRecoveryRepository } from "../infrastructure/pyrl-run-line-loan-recovery.repository";
import { PyrlRunLineRepository } from "../infrastructure/pyrl-run-line.repository";
import { PyrlRunRepository } from "../infrastructure/pyrl-run.repository";
import { PyrlStructureComponentRepository } from "../infrastructure/pyrl-structure-component.repository";

/** `appr_workflow_def.domain_code` this module submits payroll runs under — same bootstrapping-gap caveat as `PAYROLL_LOANS_APPROVAL_DOMAIN_CODE` (Pass B's own `0900` seed extension owns actually publishing a workflow def/version under this code). */
export const PAYROLL_RUN_APPROVAL_DOMAIN_CODE = "PAYROLL_RUN";

/** Starter `pyrl_component.code` catalogue — see `0900-seed-permissions-and-roles.ts`'s own doc comment for the full seed. `compute()` resolves every one of these by code and fails loudly (`NotFoundException`) if the seed hasn't run. */
export const BASIC_COMPONENT_CODE = "BASIC";
export const PAYE_COMPONENT_CODE = "PAYE";
export const NSSF_COMPONENT_CODE = "NSSF";
export const SHIF_COMPONENT_CODE = "SHIF";
export const AHL_COMPONENT_CODE = "AHL";
export const LOAN_RECOVERY_COMPONENT_CODE = "LOAN_RECOVERY";

/** BR-PYRL-03 — Settings key for the protected-net floor ratio (fraction of basic pay), default 1/3. */
export const PROTECTED_NET_FLOOR_RATIO_SETTING_KEY = "payroll.protected_net_floor_ratio";
const DEFAULT_PROTECTED_NET_FLOOR_RATIO = "0.333333";

/** `review()`'s variance-flag thresholds — Settings keys, sensible defaults per the task brief (10% / KES 5,000). */
export const VARIANCE_FLAG_PERCENT_SETTING_KEY = "payroll.variance_flag_percent";
const DEFAULT_VARIANCE_FLAG_PERCENT = "0.10";
export const VARIANCE_FLAG_ABSOLUTE_KES_SETTING_KEY = "payroll.variance_flag_absolute_kes";
const DEFAULT_VARIANCE_FLAG_ABSOLUTE_KES = "5000.00";

/** Postgres unique_violation SQLSTATE — `uq_pyrl_main_run_p` (BR-PYRL-02), see class doc comment on `commit()`. */
const PG_UNIQUE_VIOLATION = "23505";

export interface CreatePyrlRunInput {
  periodKey: string;
  runKind: PyrlRunKind;
  supplementsRunId?: string | null;
}

/** `pyrl_run.totals` jsonb shape — decimal strings (this codebase's established Money-in-DTO/jsonb convention), one field per aggregate figure `compute()` produces. */
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

interface EmployeeVarianceEntry {
  employeeId: string;
  priorGross: string;
  currentGross: string;
  priorNetPay: string;
  currentNetPay: string;
  reasons: string[];
}

/** `pyrl_run.variance_report` jsonb shape — `review()`'s output. */
export interface PyrlRunVarianceReport {
  priorRunId: string | null;
  priorPeriodKey: string | null;
  comparedAt: string;
  flagged: EmployeeVarianceEntry[];
  newEmployeeIds: string[];
  removedEmployeeIds: string[];
}

interface ComponentLineDraft {
  componentId: string;
  amount: Money;
  kind: PyrlComponentKind;
  isTaxable: boolean;
}

interface RunTotalsAccumulator {
  employeeCount: number;
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

function zeroTotals(): RunTotalsAccumulator {
  return {
    employeeCount: 0,
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
  };
}

function serializeTotals(totals: RunTotalsAccumulator): PyrlRunTotals {
  return {
    employeeCount: totals.employeeCount,
    totalGross: totals.gross.toDecimalString(),
    totalTaxable: totals.taxable.toDecimalString(),
    totalPaye: totals.paye.toDecimalString(),
    totalNssfEmployee: totals.nssfEmployee.toDecimalString(),
    totalNssfEmployer: totals.nssfEmployer.toDecimalString(),
    totalShif: totals.shif.toDecimalString(),
    totalAhlEmployee: totals.ahlEmployee.toDecimalString(),
    totalAhlEmployer: totals.ahlEmployer.toDecimalString(),
    totalLoanRecovered: totals.loanRecovered.toDecimalString(),
    totalOtherDeductions: totals.otherDeductions.toDecimalString(),
    totalNetPay: totals.netPay.toDecimalString(),
  };
}

/** `periodKey` ('YYYY-MM') -> `{start, end}` ('YYYY-MM-DD') + the calendar day-count of that month, UTC throughout (no timezone ambiguity anywhere in this module — every date here is a plain calendar date, never a timestamp). */
function periodBounds(periodKey: string): { start: string; end: string; totalDays: number } {
  const [yearStr, monthStr] = periodKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${periodKey}-01`,
    end: `${periodKey}-${String(totalDays).padStart(2, "0")}`,
    totalDays,
  };
}

/** Inclusive day-count between two `'YYYY-MM-DD'` dates (BR-PYRL-04's "worked-days-in-period" numerator). */
function daysBetweenInclusive(startDateStr: string, endDateStr: string): number {
  const [startY, startM, startD] = parseIsoDateParts(startDateStr);
  const [endY, endM, endD] = parseIsoDateParts(endDateStr);
  const start = Date.UTC(startY, startM, startD);
  const end = Date.UTC(endY, endM, endD);
  return Math.round((end - start) / 86_400_000) + 1;
}

function parseIsoDateParts(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split("-").map(Number);
  return [y, m - 1, d];
}

/** `periodKey` ('YYYY-MM') shifted by `deltaMonths` (may be negative) — used for BR-PYRL-03's prior-period `deferred_recovery` carryover lookup and `review()`'s prior-period search. */
function shiftPeriodKey(periodKey: string, deltaMonths: number): string {
  const [yearStr, monthStr] = periodKey.split("-");
  const year = Number(yearStr);
  const monthIndex0 = Number(monthStr) - 1 + deltaMonths;
  const targetYear = year + Math.floor(monthIndex0 / 12);
  const targetMonth0 = ((monthIndex0 % 12) + 12) % 12;
  return `${targetYear}-${String(targetMonth0 + 1).padStart(2, "0")}`;
}

function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string; driverError?: { code?: string } })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === PG_UNIQUE_VIOLATION;
}

/**
 * `pyrl_run` (+`pyrl_run_line`/`pyrl_run_line_component`) lifecycle (Module
 * 15 PASS B, FR-PYRL-006.1's full state chain) — THE core run-computation
 * and posting engine tying together every PASS A building block
 * (`SalaryStructuresService.resolveComponentAmount()`, `StatutoryCalculationService`'s
 * four `compute*()` methods, `LoansService.recordRecovery()`).
 *
 * **`compute()`'s proration design (BR-PYRL-04)**: an employee whose
 * `exit_date` falls STRICTLY BEFORE the period's first calendar day is
 * excluded from the run entirely (never even considered). An employee whose
 * `exit_date` falls WITHIN the period (`periodStart <= exit_date <=
 * periodEnd`) is prorated: `ratio = workedDays / totalDaysInPeriod` (both
 * plain calendar day-counts, `workedDays` inclusive of both the period's
 * first day and the exit date itself), computed to 6dp (`Money.multiply()`'s
 * own rate-scale precision) via `toFixed(6)`. Every earning figure — basic
 * pay AND every resolved structure-component amount — is computed at its
 * FULL (unprorated) value first (so `PERCENT_OF_BASIC` formulas evaluate
 * against the employee's real, full basic pay, not an already-shrunk one),
 * then uniformly multiplied by `ratio` as the very last step. This is
 * mathematically identical to prorating basic pay before feeding it into
 * `resolveComponentAmount()` for `PERCENT_OF_BASIC` lines (associativity),
 * but ALSO correctly prorates `FIXED` lines (which `resolveComponentAmount()`
 * itself has no way to prorate, since it never sees the ratio) — a single,
 * uniform post-hoc proration step handles both formula kinds identically,
 * rather than two different code paths. Full-period employees (`ratio` not
 * computed at all, left `null`) skip this multiplication entirely, so their
 * figures are byte-for-byte identical to what PASS A's existing unit tests
 * already exercise (no incidental rounding from multiplying by an exact
 * `"1.000000"`). One-off (`pyrl_oneoff`) amounts are deliberately NOT
 * prorated — a bonus/one-time deduction is, by its own nature, a fixed
 * one-time figure the payroll admin already entered for this specific
 * period, not a recurring structure line to shrink.
 *
 * **BR-PYRL-03 protected-net-floor design, multi-loan (Option B, 2026-08-21
 * user decision, closing a real gap live-confirmed in Slice 22 Part 6)**:
 * every ACTIVE `pyrl_loan` an employee has — not just the first — is
 * processed, in `PyrlLoanRepository.findActiveForEmployee()`'s own
 * oldest-created-first order (the standard, simplest, most defensible
 * priority absent a specific business rule saying otherwise — the same
 * principle used for aging any other receivable). A SINGLE shared headroom
 * pool (`netBeforeLoan - protectedFloor`, `protectedFloor = basicPay ×
 * protected_net_floor_ratio`, Settings key `payroll.protected_net_floor_ratio`,
 * default `1/3`) is allocated across loans in that order: for each loan
 * with an installment due this `period_key`, the amount ATTEMPTED is
 * `scheduledAmount + carryover` (`scheduledAmount = principal_due +
 * interest_due - recovered_amount`, `carryover` THIS SPECIFIC loan's own
 * deferred shortfall from the prior period — see below); if remaining
 * headroom covers it, the loan is recovered in full and headroom shrinks by
 * that amount before the next loan is considered; once headroom is
 * exhausted, every remaining loan gets `0` recovered and its full attempted
 * amount deferred. `pyrl_run_line.loan_recovered`/`.deferred_recovery`
 * remain the real AGGREGATE (sum across every loan) — unchanged shape, same
 * as `gross`/`net_pay` etc. are aggregates while `pyrl_run_line_component`
 * carries their own itemized breakdown. The actual per-loan breakdown (this
 * is the real fix — before this, a second loan's own recovery/deferral was
 * invisible even in aggregate, since only loan[0] was ever considered) is
 * written to `pyrl_run_line_loan_recovery` (migration `0242`), one row per
 * (run_line, loan) that had an installment due.
 *
 * **Carryover, now genuinely per-loan**: read via
 * `PyrlRunRepository.findFinalizedMainForPeriod(shiftPeriodKey(periodKey,
 * -1))` + `PyrlRunLineRepository.findByRunAndEmployee()` +
 * `PyrlRunLineLoanRecoveryRepository.findByRunLineAndLoan()` (zero if no
 * finalized MAIN run exists for the immediately-prior period, the employee
 * has no line in it, or that loan had no row in it) — the OLD single-scalar-
 * per-EMPLOYEE carryover genuinely could not distinguish "loan A deferred
 * $50, loan B deferred $30" from a blended $80, which would have
 * misattributed a carryover the moment either loan was paid off while the
 * other remained active; this is the concrete reason Option B (a schema
 * change) was chosen over accumulating into the existing scalars alone.
 *
 * `recordRecovery()` itself is NOT called during `compute()` — that
 * would permanently mutate the loan/schedule on every (recomputable,
 * pre-commit) `compute()` call; it's deferred to `commit()` (now iterating
 * `pyrl_run_line_loan_recovery` per line, calling `recordRecovery()` once
 * per loan with THAT loan's own `recovered_amount` — never the run-line's
 * blended aggregate dumped onto a single loan), the one point a run's
 * figures become truly final (BR-PYRL-06).
 *
 * **Recompute semantics**: `compute()` is idempotent-by-recomputation while
 * the run is still `DRAFT`/`COMPUTED` — every existing `pyrl_run_line` (and,
 * via `ON DELETE CASCADE`, every `pyrl_run_line_component` AND
 * `pyrl_run_line_loan_recovery`) is deleted and rebuilt wholesale on each
 * call, never incrementally patched.
 */
@Injectable()
export class PayrollRunsService {
  constructor(
    private readonly runRepository: PyrlRunRepository,
    private readonly runLineRepository: PyrlRunLineRepository,
    private readonly runLineComponentRepository: PyrlRunLineComponentRepository,
    private readonly runLineLoanRecoveryRepository: PyrlRunLineLoanRecoveryRepository,
    private readonly employeeRepository: PyrlEmployeeRepository,
    private readonly assignmentRepository: PyrlEmployeeAssignmentRepository,
    private readonly structureComponentRepository: PyrlStructureComponentRepository,
    private readonly employeeComponentRepository: PyrlEmployeeComponentRepository,
    private readonly oneoffRepository: PyrlOneoffRepository,
    private readonly componentRepository: PyrlComponentRepository,
    private readonly loanRepository: PyrlLoanRepository,
    private readonly loanScheduleRepository: PyrlLoanScheduleRepository,
    private readonly statutoryCalculationService: StatutoryCalculationService,
    private readonly loansService: LoansService,
    private readonly approvalEngine: ApprovalEngineService,
    private readonly settingsService: SettingsService,
    private readonly postingService: PostingService,
    private readonly glAccountRepository: GlAccountRepository,
  ) {}

  async createRun(em: EntityManager, input: CreatePyrlRunInput, initiatedBy: string): Promise<PyrlRunEntity> {
    if (input.runKind === "SUPPLEMENTARY" && !input.supplementsRunId) {
      throw new ValidationException("A SUPPLEMENTARY pyrl_run requires supplementsRunId (the MAIN run it corrects)");
    }
    // BR-PYRL-02 — reject a second MAIN run for a period that already has
    // one at/beyond COMMITTED, immediately, rather than letting a caller
    // walk an entire run through compute/review/submit/decide/commit before
    // hitting the (correct, but far-too-late) uq_pyrl_main_run_p conflict
    // at the very last step. `uq_pyrl_main_run_p` (migration `0241`) remains
    // the real, unconditional backstop either way — this is purely an
    // earlier, clearer application-level check ahead of it.
    if (input.runKind === "MAIN") {
      const existingFinalizedMain = await this.runRepository.findFinalizedMainForPeriod(input.periodKey, em);
      if (existingFinalizedMain) {
        throw new ConflictException(
          `pyrl_run: period ${input.periodKey} already has a finalized MAIN run (${existingFinalizedMain.id}, status ${existingFinalizedMain.status}) — create a SUPPLEMENTARY run referencing it instead of a second MAIN run`,
        );
      }
    }
    return this.runRepository.create(
      {
        periodKey: input.periodKey,
        runKind: input.runKind,
        supplementsRunId: input.supplementsRunId ?? null,
        status: "DRAFT",
        initiatedBy,
        approvedBy: null,
        committedAt: null,
        journalId: null,
        totals: {},
        varianceReport: null,
      },
      em,
    );
  }

  /** See class doc comment for the full proration/protected-net-floor design. */
  async compute(em: EntityManager, runId: string): Promise<PyrlRunEntity> {
    const run = await this.runRepository.findByIdOrFail(runId, em);
    if (run.status !== "DRAFT" && run.status !== "COMPUTED") {
      throw new ValidationException(
        `pyrl_run ${runId} cannot be (re)computed from status ${run.status} — only DRAFT/COMPUTED runs may be computed`,
      );
    }

    const { start: periodStart, end: periodEnd, totalDays } = periodBounds(run.periodKey);
    const periodEndDate = new Date(`${periodEnd}T00:00:00.000Z`);

    const basicComponent = await this.requireComponentByCode(BASIC_COMPONENT_CODE, em);
    const payeComponent = await this.requireComponentByCode(PAYE_COMPONENT_CODE, em);
    const nssfComponent = await this.requireComponentByCode(NSSF_COMPONENT_CODE, em);
    const shifComponent = await this.requireComponentByCode(SHIF_COMPONENT_CODE, em);
    const ahlComponent = await this.requireComponentByCode(AHL_COMPONENT_CODE, em);
    const loanRecoveryComponent = await this.requireComponentByCode(LOAN_RECOVERY_COMPONENT_CODE, em);

    const floorRatio = await this.settingsService.getTyped<string>(
      PROTECTED_NET_FLOOR_RATIO_SETTING_KEY,
      DEFAULT_PROTECTED_NET_FLOOR_RATIO,
    );

    await this.runLineRepository.deleteByRunId(run.id, em);

    const employees = await this.employeeRepository.list({ isActive: true }, em);
    const totals = zeroTotals();

    for (const employee of employees) {
      // BR-PYRL-04 — exclude entirely if the employee exited before the period even started.
      if (employee.exitDate && employee.exitDate < periodStart) continue;

      let prorationRatio: string | null = null;
      if (employee.exitDate && employee.exitDate >= periodStart && employee.exitDate <= periodEnd) {
        const workedDays = daysBetweenInclusive(periodStart, employee.exitDate);
        prorationRatio = (workedDays / totalDays).toFixed(6);
      }

      const assignment = await this.assignmentRepository.findActiveFor(employee.id, periodEnd, em);
      if (!assignment) continue; // no salary-structure assignment covering this period — nothing to compute, documented skip

      const componentLines: ComponentLineDraft[] = [];

      let basicPay = assignment.basicPay;
      if (prorationRatio) basicPay = basicPay.multiply(prorationRatio);
      componentLines.push({
        componentId: basicComponent.id,
        amount: basicPay,
        kind: "EARNING",
        isTaxable: basicComponent.isTaxable,
      });

      const structureLines = await this.structureComponentRepository.findByStructureId(assignment.structureId, em);
      for (const line of structureLines) {
        const component = await this.componentRepository.findByIdOrFail(line.componentId, em);
        const formula: StructureComponentFormula =
          line.amount !== null
            ? { type: "FIXED", amount: line.amount.toDecimalString() }
            : (line.formula as unknown as StructureComponentFormula);
        let amount = resolveComponentAmount(assignment.basicPay, formula);
        if (prorationRatio) amount = amount.multiply(prorationRatio);
        componentLines.push({ componentId: component.id, amount, kind: component.kind, isTaxable: component.isTaxable });
      }

      const overrides = await this.employeeComponentRepository.findActiveFor(employee.id, periodEnd, em);
      for (const override of overrides) {
        const component = await this.componentRepository.findByIdOrFail(override.componentId, em);
        let amount = override.amount;
        if (prorationRatio) amount = amount.multiply(prorationRatio);
        componentLines.push({ componentId: component.id, amount, kind: component.kind, isTaxable: component.isTaxable });
      }

      const oneoffs = await this.oneoffRepository.findByEmployeeAndPeriod(employee.id, run.periodKey, em);
      for (const oneoff of oneoffs) {
        const component = await this.componentRepository.findByIdOrFail(oneoff.componentId, em);
        componentLines.push({ componentId: component.id, amount: oneoff.amount, kind: oneoff.kind, isTaxable: component.isTaxable });
      }

      const gross = componentLines
        .filter((c) => c.kind === "EARNING")
        .reduce((sum, c) => sum.add(c.amount), Money.ZERO);
      const taxable = componentLines
        .filter((c) => c.kind === "EARNING" && c.isTaxable)
        .reduce((sum, c) => sum.add(c.amount), Money.ZERO);
      const otherDeductions = componentLines
        .filter((c) => c.kind === "DEDUCTION")
        .reduce((sum, c) => sum.add(c.amount), Money.ZERO);

      const paye = await this.statutoryCalculationService.computePaye(taxable, periodEndDate);
      const nssf = await this.statutoryCalculationService.computeNssf(gross, periodEndDate);
      const shif = await this.statutoryCalculationService.computeShif(gross, periodEndDate);
      const ahl = await this.statutoryCalculationService.computeAhl(gross, periodEndDate);

      const netBeforeLoan = gross
        .subtract(paye)
        .subtract(nssf.employee)
        .subtract(shif)
        .subtract(ahl.employee)
        .subtract(otherDeductions);

      let loanRecovered = Money.ZERO;
      let deferredRecovery = Money.ZERO;
      const loanRecoveryRows: Array<{
        loanId: string;
        scheduledAmount: Money;
        carryover: Money;
        recoveredAmount: Money;
        deferredAmount: Money;
      }> = [];

      // Option B (2026-08-21 user decision) — every ACTIVE loan, not just the
      // first, oldest-created-first (findActiveForEmployee()'s own real
      // order). A single shared headroom pool is allocated across loans in
      // that order — see class doc comment for the full design.
      const activeLoans = await this.loanRepository.findActiveForEmployee(employee.id, em);
      if (activeLoans.length > 0) {
        const protectedFloor = assignment.basicPay.multiply(floorRatio);
        let available = netBeforeLoan.subtract(protectedFloor);

        for (const loan of activeLoans) {
          const scheduleRows = await this.loanScheduleRepository.findByLoanId(loan.id, em);
          const dueRow = scheduleRows.find((row) => row.duePeriod === run.periodKey);
          if (!dueRow) continue;
          const scheduledAmount = dueRow.principalDue.add(dueRow.interestDue).subtract(dueRow.recoveredAmount);
          if (!scheduledAmount.isPositive()) continue;

          const carryover = await this.priorPeriodDeferredRecoveryForLoan(em, employee.id, loan.id, run.periodKey);
          const attempt = scheduledAmount.add(carryover);

          let recoveredThisLoan: Money;
          let deferredThisLoan = Money.ZERO;
          if (available.compare(attempt) >= 0) {
            recoveredThisLoan = attempt;
          } else {
            recoveredThisLoan = available.isPositive() ? available : Money.ZERO;
            deferredThisLoan = attempt.subtract(recoveredThisLoan);
          }
          available = available.subtract(recoveredThisLoan);

          loanRecovered = loanRecovered.add(recoveredThisLoan);
          deferredRecovery = deferredRecovery.add(deferredThisLoan);
          loanRecoveryRows.push({
            loanId: loan.id,
            scheduledAmount,
            carryover,
            recoveredAmount: recoveredThisLoan,
            deferredAmount: deferredThisLoan,
          });
        }

        if (loanRecovered.isPositive()) {
          componentLines.push({
            componentId: loanRecoveryComponent.id,
            amount: loanRecovered,
            kind: "DEDUCTION",
            isTaxable: false,
          });
        }
      }

      const netPay = netBeforeLoan.subtract(loanRecovered);

      componentLines.push({ componentId: payeComponent.id, amount: paye, kind: "DEDUCTION", isTaxable: false });
      componentLines.push({ componentId: nssfComponent.id, amount: nssf.employee, kind: "DEDUCTION", isTaxable: false });
      componentLines.push({ componentId: shifComponent.id, amount: shif, kind: "DEDUCTION", isTaxable: false });
      componentLines.push({ componentId: ahlComponent.id, amount: ahl.employee, kind: "DEDUCTION", isTaxable: false });

      const runLine = await this.runLineRepository.create(
        {
          runId: run.id,
          employeeId: employee.id,
          gross,
          taxable,
          paye,
          nssfEmployee: nssf.employee,
          nssfEmployer: nssf.employer,
          shif,
          ahlEmployee: ahl.employee,
          ahlEmployer: ahl.employer,
          loanRecovered,
          otherDeductions,
          netPay,
          deferredRecovery,
          payslipFileId: null,
          paidVia: null,
          paidAt: null,
        },
        em,
      );

      for (const line of componentLines) {
        await this.runLineComponentRepository.create(
          { runLineId: runLine.id, componentId: line.componentId, amount: line.amount },
          em,
        );
      }

      // Option B's own per-loan breakdown — one row per loan that had an
      // installment due this period, even if headroom exhaustion left its
      // own recoveredAmount at zero (that IS the real, useful record: "this
      // loan owed X, none of it recoverable this period").
      for (const row of loanRecoveryRows) {
        await this.runLineLoanRecoveryRepository.create(
          {
            runLineId: runLine.id,
            loanId: row.loanId,
            scheduledAmount: row.scheduledAmount,
            carryover: row.carryover,
            recoveredAmount: row.recoveredAmount,
            deferredAmount: row.deferredAmount,
          },
          em,
        );
      }

      totals.employeeCount += 1;
      totals.gross = totals.gross.add(gross);
      totals.taxable = totals.taxable.add(taxable);
      totals.paye = totals.paye.add(paye);
      totals.nssfEmployee = totals.nssfEmployee.add(nssf.employee);
      totals.nssfEmployer = totals.nssfEmployer.add(nssf.employer);
      totals.shif = totals.shif.add(shif);
      totals.ahlEmployee = totals.ahlEmployee.add(ahl.employee);
      totals.ahlEmployer = totals.ahlEmployer.add(ahl.employer);
      totals.loanRecovered = totals.loanRecovered.add(loanRecovered);
      totals.otherDeductions = totals.otherDeductions.add(otherDeductions);
      totals.netPay = totals.netPay.add(netPay);
    }

    run.totals = serializeTotals(totals) as unknown as Record<string, unknown>;
    run.status = "COMPUTED";
    return this.runRepository.save(run, em);
  }

  /**
   * FR-PYRL-006.1's variance report — compares this run's per-employee
   * `gross`/`net_pay` against the most recent PRIOR period's finalized MAIN
   * run (searched backward from `periodKey - 1 month`, up to 12 months, via
   * `PyrlRunRepository.findFinalizedMainForPeriod()` — NOT necessarily the
   * literal immediately-preceding `pyrl_run` row, since a period can be
   * skipped entirely or its main run might not exist yet; documented
   * judgement call per the task brief's own "your call" instruction). An
   * employee is flagged when `|delta| >= variance_flag_absolute_kes` OR
   * `|delta| / prior >= variance_flag_percent` (Settings-configurable,
   * defaults 10%/KES 5,000) on EITHER `gross` or `net_pay`; an employee
   * present in the prior run but absent from this one is listed in
   * `removedEmployeeIds`, and one present here but absent from the prior run
   * is listed in `newEmployeeIds` (never "flagged" — a new hire isn't a
   * variance, it's an addition). Percentage comparison uses plain
   * floating-point arithmetic on `Money.toDecimalString()`-derived numbers —
   * this is a non-monetary FLAGGING THRESHOLD DECISION, not a stored
   * financial figure, so `NFR-INT-004`'s no-float rule for monetary values
   * does not apply to it.
   */
  async review(em: EntityManager, runId: string): Promise<PyrlRunEntity> {
    const run = await this.runRepository.findByIdOrFail(runId, em);
    if (run.status !== "COMPUTED") {
      throw new ValidationException(`pyrl_run ${runId} cannot be reviewed from status ${run.status} — only COMPUTED runs may be reviewed`);
    }

    const currentLines = await this.runLineRepository.findByRunId(run.id, em);
    const priorRun = await this.findMostRecentPriorCommittedMain(em, run.periodKey);

    const percentThreshold = Number(
      await this.settingsService.getTyped<string>(VARIANCE_FLAG_PERCENT_SETTING_KEY, DEFAULT_VARIANCE_FLAG_PERCENT),
    );
    const absoluteThreshold = Money.fromDecimalString(
      await this.settingsService.getTyped<string>(VARIANCE_FLAG_ABSOLUTE_KES_SETTING_KEY, DEFAULT_VARIANCE_FLAG_ABSOLUTE_KES),
    );

    const flagged: EmployeeVarianceEntry[] = [];
    const newEmployeeIds: string[] = [];
    const removedEmployeeIds: string[] = [];

    if (priorRun) {
      const priorLines = await this.runLineRepository.findByRunId(priorRun.id, em);
      const priorByEmployee = new Map(priorLines.map((line) => [line.employeeId, line]));
      const currentEmployeeIds = new Set(currentLines.map((line) => line.employeeId));

      for (const line of currentLines) {
        const priorLine = priorByEmployee.get(line.employeeId);
        if (!priorLine) {
          newEmployeeIds.push(line.employeeId);
          continue;
        }

        const reasons: string[] = [];
        if (this.isVariant(priorLine.gross, line.gross, absoluteThreshold, percentThreshold)) reasons.push("gross_variance");
        if (this.isVariant(priorLine.netPay, line.netPay, absoluteThreshold, percentThreshold)) reasons.push("net_pay_variance");

        if (reasons.length > 0) {
          flagged.push({
            employeeId: line.employeeId,
            priorGross: priorLine.gross.toDecimalString(),
            currentGross: line.gross.toDecimalString(),
            priorNetPay: priorLine.netPay.toDecimalString(),
            currentNetPay: line.netPay.toDecimalString(),
            reasons,
          });
        }
      }

      for (const priorLine of priorLines) {
        if (!currentEmployeeIds.has(priorLine.employeeId)) removedEmployeeIds.push(priorLine.employeeId);
      }
    } else {
      // No prior committed MAIN run exists — every current employee is, by definition, "new" to the comparison.
      newEmployeeIds.push(...currentLines.map((line) => line.employeeId));
    }

    const varianceReport: PyrlRunVarianceReport = {
      priorRunId: priorRun?.id ?? null,
      priorPeriodKey: priorRun?.periodKey ?? null,
      comparedAt: new Date().toISOString(),
      flagged,
      newEmployeeIds,
      removedEmployeeIds,
    };

    run.varianceReport = varianceReport as unknown as Record<string, unknown>;
    run.status = "REVIEW";
    return this.runRepository.save(run, em);
  }

  /** BR-PYRL-05 (self-approval already generically blocked by `ApprovalEngineService`). */
  async submitForApproval(em: EntityManager, runId: string, initiatorId: string): Promise<PyrlRunEntity> {
    const run = await this.runRepository.findByIdOrFail(runId, em);
    if (run.status !== "REVIEW") {
      throw new ValidationException(`pyrl_run ${runId} cannot be submitted for approval from status ${run.status} — only REVIEW runs may be submitted`);
    }

    const totals = run.totals as unknown as PyrlRunTotals;
    const totalNetPay = Money.fromDecimalString(totals.totalNetPay ?? "0");

    await this.approvalEngine.submit(em, {
      domainCode: PAYROLL_RUN_APPROVAL_DOMAIN_CODE,
      entityType: "pyrl_run",
      entityId: run.id,
      amount: totalNetPay,
      initiatorId,
    });

    run.status = "PENDING_APPROVAL";
    return this.runRepository.save(run, em);
  }

  /** Interim manual-trigger pattern (no dispatcher exists) — see `LoansService.onApprovalDecided()`'s own doc comment for the identical precedent. `approved=false` returns the run to `REVIEW` (not a terminal rejection — `pyrl_run.status` has no dedicated REJECTED value, and a returned-for-more-work run is exactly what "back to REVIEW" means here). */
  async onApprovalDecided(
    em: EntityManager,
    runId: string,
    approved: boolean,
    approvedBy: string | null = null,
  ): Promise<PyrlRunEntity> {
    const run = await this.runRepository.findByIdOrFail(runId, em);
    if (run.status !== "PENDING_APPROVAL") {
      throw new ValidationException(
        `Cannot record an approval decision on a pyrl_run not in PENDING_APPROVAL (status=${run.status})`,
      );
    }

    if (approved) {
      run.status = "APPROVED";
      run.approvedBy = approvedBy;
    } else {
      run.status = "REVIEW";
    }
    return this.runRepository.save(run, em);
  }

  /**
   * Realizes P-27 in ONE `PostingService.post()` call, aggregating across
   * EVERY `pyrl_run_line` — see the class doc comment's account-mapping
   * summary and `gl-payroll-accounts.util.ts` for the resolved accounts.
   * BR-PYRL-02's `uq_pyrl_main_run_p` partial unique index is the DB
   * backstop for "at most one COMMITTED MAIN run per period" — this method
   * does not pre-check; it attempts the status-flipping `save()` and
   * translates a `23505` unique-violation into `ConflictException`, the same
   * discipline `ApprovalEngineService.submit()`/`NumberingService.allocate()`
   * apply to their own races. The debit/credit balance identity (verified by
   * `PostingService.post()`'s own `validateBalanced()`):
   * `gross + (nssf_employer + ahl_employer) = paye + (nssf_employee +
   * nssf_employer) + shif + (ahl_employee + ahl_employer) +
   * other_deductions + loan_recovered + net_pay`, which holds exactly
   * because `net_pay = gross - paye - nssf_employee - shif - ahl_employee -
   * loan_recovered - other_deductions` by `compute()`'s own definition.
   *
   * For every line with `loan_recovered > 0`, this method re-resolves the
   * employee's active loan (same `findActiveForEmployee()` selection
   * `compute()` used) and calls `LoansService.recordRecovery()` with the
   * EXACT figure `compute()` already calculated and stored on the line —
   * `recordRecovery()` itself is never called during `compute()` (see that
   * method's own doc comment), only here, at the one point a run's loan
   * recoveries become truly final and irreversible.
   */
  async commit(em: EntityManager, runId: string, committedBy: string): Promise<PyrlRunEntity> {
    const run = await this.runRepository.findByIdOrFail(runId, em);
    if (run.status !== "APPROVED") {
      throw new ValidationException(`pyrl_run ${runId} cannot be committed from status ${run.status} — only APPROVED runs may be committed`);
    }

    const lines = await this.runLineRepository.findByRunId(run.id, em);
    if (lines.length === 0) {
      throw new ValidationException(`pyrl_run ${runId} has no computed lines — nothing to commit`);
    }

    const grossByCostCenter = new Map<string, Money>();
    let employerContributions = Money.ZERO;
    let payeTotal = Money.ZERO;
    let nssfTotal = Money.ZERO;
    let shifTotal = Money.ZERO;
    let ahlTotal = Money.ZERO;
    let otherDeductionsTotal = Money.ZERO;
    let loanRecoveredTotal = Money.ZERO;
    let netPayTotal = Money.ZERO;

    for (const line of lines) {
      const employee = await this.employeeRepository.findByIdOrFail(line.employeeId, em);
      grossByCostCenter.set(employee.costCenterId, (grossByCostCenter.get(employee.costCenterId) ?? Money.ZERO).add(line.gross));
      employerContributions = employerContributions.add(line.nssfEmployer).add(line.ahlEmployer);
      payeTotal = payeTotal.add(line.paye);
      nssfTotal = nssfTotal.add(line.nssfEmployee).add(line.nssfEmployer);
      shifTotal = shifTotal.add(line.shif);
      ahlTotal = ahlTotal.add(line.ahlEmployee).add(line.ahlEmployer);
      otherDeductionsTotal = otherDeductionsTotal.add(line.otherDeductions);
      loanRecoveredTotal = loanRecoveredTotal.add(line.loanRecovered);
      netPayTotal = netPayTotal.add(line.netPay);
    }

    const [
      payrollExpenseAccount,
      employerContributionsAccount,
      payeAccount,
      nssfAccount,
      shifAccount,
      ahlAccount,
      otherDeductionsAccount,
      staffLoansReceivableAccount,
      netPayPayableAccount,
    ] = await Promise.all([
      resolvePayrollAccountByCode(this.glAccountRepository, PAYROLL_EXPENSE_ACCOUNT_CODE, em),
      resolvePayrollAccountByCode(this.glAccountRepository, EMPLOYER_STATUTORY_CONTRIBUTIONS_EXPENSE_ACCOUNT_CODE, em),
      resolvePayrollAccountByCode(this.glAccountRepository, PAYE_PAYABLE_ACCOUNT_CODE, em),
      resolvePayrollAccountByCode(this.glAccountRepository, NSSF_PAYABLE_ACCOUNT_CODE, em),
      resolvePayrollAccountByCode(this.glAccountRepository, SHIF_PAYABLE_ACCOUNT_CODE, em),
      resolvePayrollAccountByCode(this.glAccountRepository, AHL_PAYABLE_ACCOUNT_CODE, em),
      resolvePayrollAccountByCode(this.glAccountRepository, OTHER_PAYROLL_DEDUCTIONS_PAYABLE_ACCOUNT_CODE, em),
      resolvePayrollAccountByCode(this.glAccountRepository, STAFF_LOANS_RECEIVABLE_ACCOUNT_CODE, em),
      resolveNetPayPayableAccount(this.glAccountRepository, em),
    ]);

    const journalLines = [];
    for (const [costCenterId, amount] of grossByCostCenter) {
      if (!amount.isPositive()) continue;
      journalLines.push({
        accountId: payrollExpenseAccount.id,
        costCenterId,
        debit: amount,
        credit: Money.ZERO,
        memo: `Payroll gross — period ${run.periodKey}`,
        entityRefType: "pyrl_run",
        entityRefId: run.id,
      });
    }
    if (employerContributions.isPositive()) {
      journalLines.push({
        accountId: employerContributionsAccount.id,
        debit: employerContributions,
        credit: Money.ZERO,
        memo: `Employer NSSF+AHL contributions — period ${run.periodKey}`,
        entityRefType: "pyrl_run",
        entityRefId: run.id,
      });
    }
    if (payeTotal.isPositive()) {
      journalLines.push({ accountId: payeAccount.id, debit: Money.ZERO, credit: payeTotal, memo: `PAYE payable — period ${run.periodKey}`, entityRefType: "pyrl_run", entityRefId: run.id });
    }
    if (nssfTotal.isPositive()) {
      journalLines.push({ accountId: nssfAccount.id, debit: Money.ZERO, credit: nssfTotal, memo: `NSSF payable — period ${run.periodKey}`, entityRefType: "pyrl_run", entityRefId: run.id });
    }
    if (shifTotal.isPositive()) {
      journalLines.push({ accountId: shifAccount.id, debit: Money.ZERO, credit: shifTotal, memo: `SHIF payable — period ${run.periodKey}`, entityRefType: "pyrl_run", entityRefId: run.id });
    }
    if (ahlTotal.isPositive()) {
      journalLines.push({ accountId: ahlAccount.id, debit: Money.ZERO, credit: ahlTotal, memo: `AHL payable — period ${run.periodKey}`, entityRefType: "pyrl_run", entityRefId: run.id });
    }
    if (otherDeductionsTotal.isPositive()) {
      journalLines.push({
        accountId: otherDeductionsAccount.id,
        debit: Money.ZERO,
        credit: otherDeductionsTotal,
        memo: `Other payroll deductions payable — period ${run.periodKey}`,
        entityRefType: "pyrl_run",
        entityRefId: run.id,
      });
    }
    if (loanRecoveredTotal.isPositive()) {
      journalLines.push({
        accountId: staffLoansReceivableAccount.id,
        debit: Money.ZERO,
        credit: loanRecoveredTotal,
        memo: `Staff loan recoveries — period ${run.periodKey}`,
        entityRefType: "pyrl_run",
        entityRefId: run.id,
      });
    }
    if (netPayTotal.isPositive()) {
      journalLines.push({
        accountId: netPayPayableAccount.id,
        debit: Money.ZERO,
        credit: netPayTotal,
        memo: `Net pay payable — period ${run.periodKey}`,
        entityRefType: "pyrl_run",
        entityRefId: run.id,
      });
    }

    // Option B (2026-08-21) — read back EXACTLY what compute() already
    // decided per loan, never re-derive "the employee's active loans" at
    // commit time (which could genuinely have drifted since compute() ran —
    // reading the frozen, already-reviewed/approved breakdown is the
    // correct thing to commit, not a possibly-different live state).
    for (const line of lines) {
      if (!line.loanRecovered.isPositive()) continue;
      const loanRecoveryRows = await this.runLineLoanRecoveryRepository.findByRunLineId(line.id, em);
      if (loanRecoveryRows.length === 0) {
        throw new ValidationException(
          `PayrollRunsService.commit: pyrl_run_line ${line.id} recorded a loan recovery but has no pyrl_run_line_loan_recovery breakdown rows`,
        );
      }
      for (const row of loanRecoveryRows) {
        if (!row.recoveredAmount.isPositive()) continue;
        await this.loansService.recordRecovery(em, row.loanId, run.periodKey, row.recoveredAmount);
      }
    }

    const journal = await this.postingService.post(em, {
      journalDate: new Date().toISOString().slice(0, 10),
      sourceModule: "payroll",
      sourceDocType: "pyrl_run",
      sourceDocId: run.id,
      narration: `Payroll commit (P-27) — period ${run.periodKey}`,
      journalType: "SYSTEM",
      postedBy: committedBy,
      lines: journalLines,
    });

    run.status = "COMMITTED";
    run.committedAt = new Date();
    run.journalId = journal.id;

    try {
      return await this.runRepository.save(run, em);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `pyrl_run: a COMMITTED MAIN run already exists for period ${run.periodKey} (uq_pyrl_main_run_p, BR-PYRL-02)`,
        );
      }
      throw error;
    }
  }

  /**
   * Realizes P-28 in a SEPARATE `PostingService.post()` call (debits the
   * Net-Pay-Payable/`PAYROLL` control account, credits the resolved bank
   * clearing account per `method` — see `resolveBankDisbursementAccount()`'s
   * own doc comment for the interim Banking-forward-gap). Every
   * `pyrl_run_line.paid_via`/`.paid_at` is updated — legal under
   * `trg_pyrl_run_line_immutable`, which explicitly leaves exactly these two
   * columns writable once the parent run is `COMMITTED`+.
   */
  async pay(
    em: EntityManager,
    runId: string,
    options: { method: PyrlRunLinePaidVia },
    paidBy: string,
  ): Promise<PyrlRunEntity> {
    const run = await this.runRepository.findByIdOrFail(runId, em);
    if (run.status !== "COMMITTED") {
      throw new ValidationException(`pyrl_run ${runId} cannot be paid from status ${run.status} — only COMMITTED runs may be paid`);
    }

    const lines = await this.runLineRepository.findByRunId(run.id, em);
    const totalNetPay = lines.reduce((sum, line) => sum.add(line.netPay), Money.ZERO);
    if (!totalNetPay.isPositive()) {
      throw new ValidationException(`pyrl_run ${runId} has no positive net pay to disburse`);
    }

    const netPayPayableAccount = await resolveNetPayPayableAccount(this.glAccountRepository, em);
    const bankAccount = await resolveBankDisbursementAccount(this.glAccountRepository, options.method, em);

    await this.postingService.post(em, {
      journalDate: new Date().toISOString().slice(0, 10),
      sourceModule: "payroll",
      sourceDocType: "pyrl_run",
      sourceDocId: run.id,
      narration: `Payroll net pay disbursed (P-28) — period ${run.periodKey} via ${options.method}`,
      journalType: "SYSTEM",
      postedBy: paidBy,
      lines: [
        {
          accountId: netPayPayableAccount.id,
          debit: totalNetPay,
          credit: Money.ZERO,
          memo: `Net pay disbursed — period ${run.periodKey}`,
          entityRefType: "pyrl_run",
          entityRefId: run.id,
        },
        {
          accountId: bankAccount.id,
          debit: Money.ZERO,
          credit: totalNetPay,
          memo: `Net pay disbursed via ${options.method} — period ${run.periodKey}`,
          entityRefType: "pyrl_run",
          entityRefId: run.id,
        },
      ],
    });

    const paidAt = new Date();
    for (const line of lines) {
      line.paidVia = options.method;
      line.paidAt = paidAt;
      await this.runLineRepository.save(line, em);
    }

    run.status = "PAID";
    return this.runRepository.save(run, em);
  }

  /**
   * Marks the period's statutory filing as administratively complete.
   * **Deliberately does NOT generate real P10/NSSF/SHIF/AHL filing
   * documents** (FR-PYRL-009.1) — real filing-document GENERATION is a
   * Reporting Engine concern (Module 18, not built yet); nor does it
   * generate payslip PDFs (FR-PYRL-008.1) — `pyrl_run_line.payslip_file_id`
   * stays `null`. Both are documented, deferred outputs, not half-built
   * here.
   */
  async file(em: EntityManager, runId: string): Promise<PyrlRunEntity> {
    const run = await this.runRepository.findByIdOrFail(runId, em);
    if (run.status !== "PAID") {
      throw new ValidationException(`pyrl_run ${runId} cannot be filed from status ${run.status} — only PAID runs may be filed`);
    }
    run.status = "FILED";
    return this.runRepository.save(run, em);
  }

  async get(runId: string, em?: EntityManager): Promise<PyrlRunEntity> {
    return this.runRepository.findByIdOrFail(runId, em);
  }

  async list(filter: { periodKey?: string; status?: PyrlRunStatus } = {}, em?: EntityManager): Promise<PyrlRunEntity[]> {
    return this.runRepository.list(filter, em);
  }

  async listLines(runId: string, em?: EntityManager): Promise<PyrlRunLineEntity[]> {
    return this.runLineRepository.findByRunId(runId, em);
  }

  async listLineComponents(runLineId: string, em?: EntityManager) {
    return this.runLineComponentRepository.findByRunLineId(runLineId, em);
  }

  private async requireComponentByCode(code: string, em: EntityManager): Promise<PyrlComponentEntity> {
    const component = await this.componentRepository.findByCode(code, em);
    if (!component) {
      throw new NotFoundException(
        "PyrlComponent",
        `code=${code} — the starter pyrl_component catalogue must be seeded (0900-seed-permissions-and-roles.ts) before a run can be computed`,
      );
    }
    return component;
  }

  /** BR-PYRL-03's per-loan carryover lookup — see class doc comment (Option B, 2026-08-21). */
  private async priorPeriodDeferredRecoveryForLoan(
    em: EntityManager,
    employeeId: string,
    loanId: string,
    periodKey: string,
  ): Promise<Money> {
    const priorPeriodKey = shiftPeriodKey(periodKey, -1);
    const priorRun = await this.runRepository.findFinalizedMainForPeriod(priorPeriodKey, em);
    if (!priorRun) return Money.ZERO;
    const priorLine = await this.runLineRepository.findByRunAndEmployee(priorRun.id, employeeId, em);
    if (!priorLine) return Money.ZERO;
    const priorLoanRecovery = await this.runLineLoanRecoveryRepository.findByRunLineAndLoan(priorLine.id, loanId, em);
    return priorLoanRecovery ? priorLoanRecovery.deferredAmount : Money.ZERO;
  }

  /** `review()`'s prior-run resolution — see class doc comment. Searches up to 12 months back. */
  private async findMostRecentPriorCommittedMain(em: EntityManager, periodKey: string): Promise<PyrlRunEntity | null> {
    for (let monthsBack = 1; monthsBack <= 12; monthsBack++) {
      const candidatePeriodKey = shiftPeriodKey(periodKey, -monthsBack);
      const candidate = await this.runRepository.findFinalizedMainForPeriod(candidatePeriodKey, em);
      if (candidate) return candidate;
    }
    return null;
  }

  private isVariant(prior: Money, current: Money, absoluteThreshold: Money, percentThreshold: number): boolean {
    const delta = current.subtract(prior);
    const absDelta = delta.isNegative() ? delta.negate() : delta;
    if (absDelta.compare(absoluteThreshold) >= 0) return true;
    if (prior.isZero()) return current.isPositive();
    const percent = Number(absDelta.toDecimalString()) / Number(prior.toDecimalString());
    return percent >= percentThreshold;
  }
}

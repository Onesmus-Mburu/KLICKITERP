import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ApprovalEngineService } from "../../../platform/approvals";
import { NumberingService } from "../../../platform/settings";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money, RoundingMode } from "../../../shared/money/money";
import { PyrlLoanEntity, PyrlLoanRateKind } from "../domain/pyrl-loan.entity";
import { PyrlLoanRepository } from "../infrastructure/pyrl-loan.repository";
import { PyrlLoanScheduleEntity } from "../domain/pyrl-loan-schedule.entity";
import { PyrlLoanScheduleRepository } from "../infrastructure/pyrl-loan-schedule.repository";

/** `appr_workflow_def.domain_code` this module submits staff loans under — same bootstrapping-gap caveat as every other domain module's own `*_APPROVAL_DOMAIN_CODE` (Pass B/a future seed migration owns actually publishing a workflow def/version under this code). */
export const PAYROLL_LOANS_APPROVAL_DOMAIN_CODE = "PAYROLL_LOANS";

/** `NumberingService.allocate()` doc_type for staff loan numbers. */
const LOAN_NUMBER_DOC_TYPE = "PYRL_LOAN";

export interface CreateLoanInput {
  employeeId: string;
  principal: Money;
  /** Decimal-string annual rate as a fraction (e.g. `"0.145000"` for 14.5%/year) — matches `pyrl_loan.rate`'s `NUMERIC(9,6)` storage. */
  rate: string;
  rateKind: PyrlLoanRateKind;
  termMonths: number;
}

export interface AmortizationInstallment {
  seq: number;
  principalDue: Money;
  interestDue: Money;
}

/**
 * FLAT-rate amortization (FR-PYRL-004.1). Formula (as documented in the
 * task brief): equal PRINCIPAL installment each period
 * (`principal / termMonths`, via `Money.allocate()`'s largest-remainder
 * method so the parts sum to EXACTLY `principal`, no rounding leakage) PLUS
 * a flat INTEREST amount every period, computed as
 * `(principal × annualRate) / 12` — i.e. one-twelfth of a full year's
 * interest on the ORIGINAL principal, repeated unchanged for every
 * installment regardless of `termMonths` (the defining trait of a flat-rate
 * loan: interest is never recalculated against a declining balance).
 * `RoundingMode.HALF_UP` throughout (ordinary monetary rounding — per
 * `money.ts`'s own rounding matrix, HALF_EVEN is reserved for tax-style
 * proportional splits, not loan installments).
 */
export function generateFlatSchedule(
  principal: Money,
  ratePerAnnum: string,
  termMonths: number,
): AmortizationInstallment[] {
  const principalShares = principal.allocate(new Array(termMonths).fill(1));
  const annualInterest = principal.multiply(ratePerAnnum, RoundingMode.HALF_UP);
  const monthlyInterest = divideMoneyByInt(annualInterest, 12, RoundingMode.HALF_UP);
  return principalShares.map((principalDue, index) => ({
    seq: index + 1,
    principalDue,
    interestDue: monthlyInterest,
  }));
}

/**
 * REDUCING-balance amortization (FR-PYRL-004.1) — the standard annuity/EMI
 * formula: `EMI = P × r × (1+r)^n / ((1+r)^n − 1)` where `r` is the MONTHLY
 * rate (`annualRate / 12`) and `n = termMonths` (or `EMI = P / n` when
 * `r = 0`). Each period: `interestDue = round(balance × r, 4dp)`,
 * `principalDue = EMI − interestDue` (the LAST period instead takes
 * `principalDue = balance`, the exact remaining amount, so the schedule
 * always reconciles to zero regardless of rounding drift accumulated over
 * the term — standard amortization-table practice). `balance` then reduces
 * by `principalDue`.
 *
 * **Float usage, documented**: computing `(1+r)^n` requires real
 * (non-terminating-decimal) exponentiation, which `Money`'s bigint/decimal
 * arithmetic cannot express. `Math.pow` (IEEE-754 double) is used ONLY to
 * derive the single scalar EMI constant; the result is rounded to Money's
 * 4dp scale (`.toFixed(4)`) immediately, at the edge, before it becomes a
 * `Money` value — no float value is carried through the per-period loop,
 * which is pure `Money`/bigint arithmetic from that point on (`interestDue`
 * via `Money.multiply`, `principalDue`/`balance` via `Money.subtract`).
 * `RoundingMode.HALF_UP` throughout, same "ordinary monetary rounding"
 * reasoning as the FLAT schedule.
 */
export function generateReducingSchedule(
  principal: Money,
  ratePerAnnum: string,
  termMonths: number,
): AmortizationInstallment[] {
  const monthlyRateNum = Number(ratePerAnnum) / 12;
  const monthlyRateStr = monthlyRateNum.toFixed(6);
  const principalNum = Number(principal.toDecimalString());

  let emi: Money;
  if (monthlyRateNum === 0) {
    emi = Money.fromDecimalString((principalNum / termMonths).toFixed(4));
  } else {
    const pow = Math.pow(1 + monthlyRateNum, termMonths);
    const emiRaw = (principalNum * monthlyRateNum * pow) / (pow - 1);
    emi = Money.fromDecimalString(emiRaw.toFixed(4));
  }

  let balance = principal;
  const rows: AmortizationInstallment[] = [];
  for (let seq = 1; seq <= termMonths; seq++) {
    const interestDue = balance.multiply(monthlyRateStr, RoundingMode.HALF_UP);
    const principalDue = seq === termMonths ? balance : emi.subtract(interestDue);
    balance = balance.subtract(principalDue);
    rows.push({ seq, principalDue, interestDue });
  }
  return rows;
}

/** Divides a `Money` amount by a positive integer, rounding to Money's 4dp scale — replicates `money.ts`'s own (private) `divideWithRounding` at the bigint level, exposed here since `Money` has no public "divide by int" API. Zero-float, exact. */
function divideMoneyByInt(amount: Money, divisor: number, mode: RoundingMode): Money {
  const scaled = amount.toScaled();
  const div = BigInt(divisor);
  const negative = scaled < 0n;
  const absScaled = negative ? -scaled : scaled;
  const quotient = absScaled / div;
  const remainder = absScaled % div;
  const twiceRemainder = remainder * 2n;

  let rounded = quotient;
  if (twiceRemainder > div) {
    rounded += 1n;
  } else if (twiceRemainder === div) {
    if (mode === RoundingMode.HALF_UP) {
      rounded += 1n;
    } else if (mode === RoundingMode.HALF_EVEN && quotient % 2n === 1n) {
      rounded += 1n;
    }
  }
  return Money.fromScaled(negative ? -rounded : rounded);
}

/** `due_period` ('YYYY-MM') `months` after `periodKey`. */
function addMonthsToPeriodKey(periodKey: string, months: number): string {
  const [yearStr, monthStr] = periodKey.split("-");
  const year = Number(yearStr);
  const monthIndex0 = Number(monthStr) - 1 + months;
  const targetYear = year + Math.floor(monthIndex0 / 12);
  const targetMonth0 = ((monthIndex0 % 12) + 12) % 12;
  return `${targetYear}-${String(targetMonth0 + 1).padStart(2, "0")}`;
}

/**
 * `pyrl_loan` (+`pyrl_loan_schedule`) lifecycle (Module 15 PASS A,
 * FR-PYRL-004.1): create -> submit for approval -> (approve: generate the
 * full amortization schedule and activate) / (reject: write off) ->
 * per-run recovery -> settle (on schedule or early).
 *
 * **`onApprovalDecided()` — interim manual-trigger pattern**: no event
 * dispatcher exists anywhere in this codebase yet (same caveat
 * `BudgetsService.onApprovalDecided()`'s own doc comment documents) — a
 * future Pass B controller (or dispatcher, once one exists) is expected to
 * call this once `ApprovalEngineService.decide()` resolves a `PAYROLL_LOANS`
 * instance, exactly the `budgets.controller.ts` manual `activate`/`reject`
 * action stand-in precedent.
 *
 * **Rejection -> `WRITTEN_OFF`, documented choice**: the DDL's `pyrl_loan`
 * status enum is `PENDING_APPROVAL | ACTIVE | SETTLED | WRITTEN_OFF` — no
 * `REJECTED` value exists. A rejected loan APPLICATION (one that never
 * reached `ACTIVE`, so `balance` never really represented a live
 * outstanding debt) lands at `WRITTEN_OFF` immediately, the nearest
 * available terminal state; no schedule rows are ever generated for it.
 *
 * **Schedule generation's `due_period` anchor**: `onApprovalDecided()`'s
 * signature is fixed by the task brief (`em, loanId, approved` — no
 * explicit start-period parameter), so installment `seq=1`'s `due_period`
 * is the CALENDAR MONTH the approval decision itself is recorded in (i.e.
 * "now"), each subsequent installment one calendar month later. Documented
 * judgement call — a Pass B controller/dispatcher that needs a different
 * anchor (e.g. "recoveries start the month AFTER approval") can trivially
 * shift by pre-dating/post-dating when it calls this method.
 */
@Injectable()
export class LoansService {
  constructor(
    private readonly loanRepository: PyrlLoanRepository,
    private readonly loanScheduleRepository: PyrlLoanScheduleRepository,
    private readonly numberingService: NumberingService,
    private readonly approvalEngine: ApprovalEngineService,
  ) {}

  async create(em: EntityManager, input: CreateLoanInput, initiatorId: string): Promise<PyrlLoanEntity> {
    if (!input.principal.isPositive()) {
      throw new ValidationException("pyrl_loan principal must be positive");
    }
    if (!Number.isInteger(input.termMonths) || input.termMonths <= 0) {
      throw new ValidationException("pyrl_loan term_months must be a positive integer");
    }

    const number = await this.numberingService.allocate(em, LOAN_NUMBER_DOC_TYPE);
    const loan = await this.loanRepository.create(
      {
        number,
        employeeId: input.employeeId,
        principal: input.principal,
        rate: input.rate,
        rateKind: input.rateKind,
        termMonths: input.termMonths,
        status: "PENDING_APPROVAL",
        approvalRef: null,
        balance: input.principal,
        createdBy: initiatorId,
        updatedBy: initiatorId,
      },
      em,
    );

    const instance = await this.approvalEngine.submit(em, {
      domainCode: PAYROLL_LOANS_APPROVAL_DOMAIN_CODE,
      entityType: "pyrl_loan",
      entityId: loan.id,
      amount: input.principal,
      initiatorId,
    });
    loan.approvalRef = instance.id;
    return this.loanRepository.save(loan, em);
  }

  /** Records an approval decision — see class doc comment for the interim manual-trigger pattern and the WRITTEN_OFF-on-reject choice. */
  async onApprovalDecided(em: EntityManager, loanId: string, approved: boolean): Promise<PyrlLoanEntity> {
    const loan = await this.loanRepository.findByIdOrFail(loanId, em);
    if (loan.status !== "PENDING_APPROVAL") {
      throw new ValidationException(
        `Cannot record an approval decision on a pyrl_loan not in PENDING_APPROVAL (status=${loan.status})`,
      );
    }

    if (!approved) {
      loan.status = "WRITTEN_OFF";
      return this.loanRepository.save(loan, em);
    }

    loan.status = "ACTIVE";
    loan.balance = loan.principal;
    const savedLoan = await this.loanRepository.save(loan, em);

    const installments =
      loan.rateKind === "FLAT"
        ? generateFlatSchedule(loan.principal, loan.rate, loan.termMonths)
        : generateReducingSchedule(loan.principal, loan.rate, loan.termMonths);

    const startPeriod = toPeriodKey(new Date());
    for (const installment of installments) {
      await this.loanScheduleRepository.create(
        {
          loanId: savedLoan.id,
          seq: installment.seq,
          duePeriod: addMonthsToPeriodKey(startPeriod, installment.seq - 1),
          principalDue: installment.principalDue,
          interestDue: installment.interestDue,
          recoveredAmount: Money.ZERO,
        },
        em,
      );
    }

    return savedLoan;
  }

  /** Called by Pass B's run-computation per employee per period. Updates the matching schedule row's `recovered_amount` and decrements `pyrl_loan.balance`; flips to `SETTLED` once `balance` reaches zero. */
  async recordRecovery(em: EntityManager, loanId: string, periodKey: string, amount: Money): Promise<PyrlLoanEntity> {
    if (!amount.isPositive()) {
      throw new ValidationException("recordRecovery amount must be positive");
    }
    const loan = await this.loanRepository.findByIdOrFail(loanId, em);
    if (loan.status !== "ACTIVE") {
      throw new ValidationException(`Cannot record a recovery against a pyrl_loan that is not ACTIVE (status=${loan.status})`);
    }

    const scheduleRows = await this.loanScheduleRepository.findByLoanId(loanId, em);
    const row = scheduleRows.find((r) => r.duePeriod === periodKey);
    if (!row) {
      throw new ValidationException(`pyrl_loan ${loanId} has no installment due in period ${periodKey}`);
    }
    row.recoveredAmount = row.recoveredAmount.add(amount);
    await this.loanScheduleRepository.save(row, em);

    loan.balance = loan.balance.subtract(amount);
    if (loan.balance.compare(Money.ZERO) <= 0) {
      loan.balance = Money.ZERO;
      loan.status = "SETTLED";
    }
    return this.loanRepository.save(loan, em);
  }

  /**
   * Out-of-band lump-sum settlement. Cancels every STRICTLY FUTURE
   * (`due_period > settlementDate`'s period) installment that has not yet
   * had any recovery recorded against it (`principal_due`/`interest_due`
   * zeroed out — the lump sum pays the whole remaining balance off in one
   * shot, outside the schedule). Installment rows due at/before the
   * settlement period are left untouched (any recovery for the settlement
   * month itself is expected to have already gone through
   * `recordRecovery()`, or is simply absorbed into the lump sum by the
   * caller's own accounting — this method's job is only to close out the
   * loan and cancel what's left on the schedule). The loan itself always
   * ends at `balance=0`/`status=SETTLED`.
   */
  async settleEarly(em: EntityManager, loanId: string, settlementDate: string): Promise<PyrlLoanEntity> {
    const loan = await this.loanRepository.findByIdOrFail(loanId, em);
    if (loan.status !== "ACTIVE") {
      throw new ValidationException(`Cannot early-settle a pyrl_loan that is not ACTIVE (status=${loan.status})`);
    }

    const settlementPeriod = settlementDate.slice(0, 7);
    const scheduleRows = await this.loanScheduleRepository.findByLoanId(loanId, em);
    for (const row of scheduleRows) {
      if (row.duePeriod <= settlementPeriod) continue;
      if (!row.recoveredAmount.isZero()) continue;
      row.principalDue = Money.ZERO;
      row.interestDue = Money.ZERO;
      await this.loanScheduleRepository.save(row, em);
    }

    loan.balance = Money.ZERO;
    loan.status = "SETTLED";
    return this.loanRepository.save(loan, em);
  }

  async get(id: string, em?: EntityManager): Promise<PyrlLoanEntity> {
    return this.loanRepository.findByIdOrFail(id, em);
  }

  async listByEmployee(employeeId: string, em?: EntityManager): Promise<PyrlLoanEntity[]> {
    return this.loanRepository.list({ employeeId }, em);
  }

  async schedule(loanId: string, em?: EntityManager): Promise<PyrlLoanScheduleEntity[]> {
    return this.loanScheduleRepository.findByLoanId(loanId, em);
  }
}

function toPeriodKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

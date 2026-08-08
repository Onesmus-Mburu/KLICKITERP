import { Injectable } from "@nestjs/common";
import {
  GlAccountClass,
  GlAccountRepository,
  GlPeriodAccountTotalRepository,
  GlPeriodRepository,
} from "../../../accounting";
import { Money } from "../../../shared/money/money";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface IncomeStatementParams {
  fromPeriodId: string;
  toPeriodId: string;
}

interface AccountTotals {
  debit: Money;
  credit: Money;
}

/** INCOME/EXPENSE only — ASSET/LIABILITY/EQUITY belong to `BalanceSheetReport`, never this report. */
const INCOME_STATEMENT_CLASSES: readonly GlAccountClass[] = ["INCOME", "EXPENSE"];

/**
 * FR-RPT-008 report-of-record Income Statement (P&L) across a period RANGE,
 * reading `gl_period_account_total` directly — never `mv_income_expense`
 * (that MV feeds the Dashboard chart only, per that view's own doc comment:
 * "Report-of-record income statements bypass this view and read
 * `gl_journal_line` directly (FR-RPT-008)" — this report is exactly that
 * promised bypass).
 *
 * **PERIOD-RANGE, NOT CUMULATIVE (the key distinction from
 * `BalanceSheetReport`)**: INCOME/EXPENSE accounts reset to zero every fiscal
 * year (closing entries zero them out at year-end — `GlJournalType`'s
 * `'CLOSING'` journal type exists for exactly this), so unlike a balance
 * sheet account's "cumulative since the fiscal year started" figure, a P&L
 * figure is only ever meaningful summed across a bounded RANGE the caller
 * chooses (a term, a quarter, a full year) — never "since the beginning of
 * time." This report therefore takes an explicit `fromPeriodId`/`toPeriodId`
 * pair rather than a single "as of" period, and sums ONLY the periods between
 * them (inclusive), never periods before `fromPeriodId`.
 *
 * **Same-fiscal-year requirement**: both periods must belong to the same
 * `gl_fiscal_year` — summing INCOME/EXPENSE movement across a fiscal-year
 * boundary would silently straddle a closing entry and produce a figure that
 * means nothing (part pre-close, part post-close), so this is rejected with
 * `ValidationException` rather than silently computed. Within that shared
 * fiscal year, the range is resolved by `GlPeriodEntity.seq` (fiscal-year-
 * scoped sequence number) — `fromPeriod.seq <= period.seq <= toPeriod.seq` —
 * mirroring `BalanceSheetReport`'s own `seq`-based range filter, just bounded
 * on both ends instead of only the top.
 */
@Injectable()
export class IncomeStatementReport implements ReportDefinition<IncomeStatementParams> {
  readonly code = "income-statement";
  readonly name = "Income Statement";
  readonly domain = "accounting";
  readonly permissionCode = "reports:income-statement:view";
  readonly paramsShape = { fromPeriodId: "uuid", toPeriodId: "uuid" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "accountCode", label: "Account Code", type: "string" },
    { key: "accountName", label: "Account Name", type: "string" },
    { key: "class", label: "Class", type: "string" },
    { key: "amount", label: "Amount", type: "money" },
  ];

  constructor(
    private readonly periodRepository: GlPeriodRepository,
    private readonly accountRepository: GlAccountRepository,
    private readonly periodAccountTotalRepository: GlPeriodAccountTotalRepository,
  ) {}

  async execute(params: IncomeStatementParams): Promise<ReportResult> {
    const [fromPeriod, toPeriod] = await Promise.all([
      this.periodRepository.findByIdOrFail(params.fromPeriodId),
      this.periodRepository.findByIdOrFail(params.toPeriodId),
    ]);

    if (fromPeriod.fiscalYearId !== toPeriod.fiscalYearId) {
      throw new ValidationException(
        `IncomeStatementReport: fromPeriodId (${params.fromPeriodId}) and toPeriodId (${params.toPeriodId}) ` +
          `must belong to the same fiscal year — INCOME/EXPENSE accounts reset at each fiscal year's close, ` +
          `so a range spanning fiscal years has no single meaningful figure`,
      );
    }
    if (fromPeriod.seq > toPeriod.seq) {
      throw new ValidationException(
        `IncomeStatementReport: fromPeriodId (seq ${fromPeriod.seq}) must not be after toPeriodId (seq ${toPeriod.seq})`,
      );
    }

    const fiscalYearPeriods = await this.periodRepository.listByFiscalYear(fromPeriod.fiscalYearId);
    const includedPeriods = fiscalYearPeriods.filter(
      (period) => period.seq >= fromPeriod.seq && period.seq <= toPeriod.seq,
    );

    const totalsRowsByPeriod = await Promise.all(
      includedPeriods.map((period) => this.periodAccountTotalRepository.listByPeriod(period.id)),
    );

    const byAccount = new Map<string, AccountTotals>();
    for (const totalsRows of totalsRowsByPeriod) {
      for (const row of totalsRows) {
        const existing = byAccount.get(row.accountId) ?? { debit: Money.ZERO, credit: Money.ZERO };
        byAccount.set(row.accountId, {
          debit: existing.debit.add(row.debitTotal),
          credit: existing.credit.add(row.creditTotal),
        });
      }
    }

    const accounts = await this.accountRepository.list();
    const postable = accounts
      .filter((account) => account.isPostable && INCOME_STATEMENT_CLASSES.includes(account.class))
      .sort((a, b) => a.code.localeCompare(b.code));

    const rows = postable.map((account) => {
      const totals = byAccount.get(account.id) ?? { debit: Money.ZERO, credit: Money.ZERO };
      // INCOME is credit-normal (amount = credit - debit); EXPENSE is debit-normal (amount = debit - credit).
      const amount = account.class === "INCOME" ? totals.credit.subtract(totals.debit) : totals.debit.subtract(totals.credit);
      return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        class: account.class,
        amount,
      };
    });

    const sumByClass = (cls: GlAccountClass): Money =>
      rows.filter((row) => row.class === cls).reduce((sum, row) => sum.add(row.amount), Money.ZERO);

    const totalIncome = sumByClass("INCOME");
    const totalExpense = sumByClass("EXPENSE");

    return {
      rows,
      totals: {
        totalIncome,
        totalExpense,
        netIncome: totalIncome.subtract(totalExpense),
      },
      generatedAt: new Date(),
    };
  }
}

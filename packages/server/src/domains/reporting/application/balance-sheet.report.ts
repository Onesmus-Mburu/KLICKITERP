import { Injectable } from "@nestjs/common";
import {
  GlAccountClass,
  GlAccountRepository,
  GlPeriodAccountTotalRepository,
  GlPeriodRepository,
} from "../../../accounting";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface BalanceSheetParams {
  periodId: string;
}

interface AccountTotals {
  debit: Money;
  credit: Money;
}

/** ASSET/LIABILITY/EQUITY only — INCOME/EXPENSE belong to `IncomeStatementReport`, never this report (they don't carry a cumulative "as of" balance; they reset to zero every fiscal year). */
const BALANCE_SHEET_CLASSES: readonly GlAccountClass[] = ["ASSET", "LIABILITY", "EQUITY"];

/**
 * FR-RPT-008 report-of-record Balance Sheet (Statement of Financial
 * Position) as of a given period, reading `gl_journal`/`gl_period_account_total`
 * directly — never `mv_income_expense` (INCOME/EXPENSE-only, Dashboard-scoped).
 *
 * **CUMULATIVE-RANGE QUERY (the key distinction from `TrialBalanceReport`/
 * `IncomeStatementReport`)**: a balance sheet account's balance is its
 * balance-TO-DATE, not one period's movement — `gl_period_account_total` only
 * stores PER-PERIOD movement totals (see that entity's own doc comment), so
 * this report must SUM every period's movement from the start of the given
 * period's fiscal year up to and INCLUDING that period. Concretely:
 * 1. Load the given `periodId` via `GlPeriodRepository.findByIdOrFail()` to
 *    read its `fiscalYearId`/`seq`.
 * 2. `GlPeriodRepository.listByFiscalYear(fiscalYearId)` — every period in
 *    that SAME fiscal year (never crosses a fiscal-year boundary: a new
 *    fiscal year's opening balances are themselves a fresh `OPENING`-type
 *    journal posted into period 1, per `GlJournalType`, so period 1's own
 *    `gl_period_account_total` rows already carry the prior year's closing
 *    position forward — summing across fiscal years would double count
 *    nothing, but summing from BEFORE the fiscal year's period 1 has no
 *    periods to sum in the first place, since `gl_period` rows only exist
 *    within a `gl_fiscal_year`).
 * 3. Filter that list to `seq <= targetPeriod.seq` — "up to and including"
 *    the given period, by fiscal-year-scoped sequence number, exactly as the
 *    task brief specifies.
 * 4. Sum `debit_total`/`credit_total` across ALL those periods' `gl_period_account_total`
 *    rows (across every `cost_center_id`, same per-account aggregation
 *    `TrialBalanceReport` uses) to get each account's cumulative movement.
 * 5. Convert cumulative debit/credit into a signed balance per account's
 *    normal side: ASSET accounts are debit-normal (`balance = debit -
 *    credit`); LIABILITY/EQUITY accounts are credit-normal (`balance = credit
 *    - debit`) — the standard accounting-equation sign convention, so
 *    `totalAssets - (totalLiabilities + totalEquity)` is meaningfully
 *    comparable to zero.
 */
@Injectable()
export class BalanceSheetReport implements ReportDefinition<BalanceSheetParams> {
  readonly code = "balance-sheet";
  readonly name = "Balance Sheet";
  readonly domain = "accounting";
  readonly permissionCode = "reports:balance-sheet:view";
  readonly paramsShape = { periodId: "uuid" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "accountCode", label: "Account Code", type: "string" },
    { key: "accountName", label: "Account Name", type: "string" },
    { key: "class", label: "Class", type: "string" },
    { key: "balance", label: "Balance", type: "money" },
  ];

  constructor(
    private readonly periodRepository: GlPeriodRepository,
    private readonly accountRepository: GlAccountRepository,
    private readonly periodAccountTotalRepository: GlPeriodAccountTotalRepository,
  ) {}

  async execute(params: BalanceSheetParams): Promise<ReportResult> {
    const asOfPeriod = await this.periodRepository.findByIdOrFail(params.periodId);
    const fiscalYearPeriods = await this.periodRepository.listByFiscalYear(asOfPeriod.fiscalYearId);
    const includedPeriods = fiscalYearPeriods.filter((period) => period.seq <= asOfPeriod.seq);

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
      .filter((account) => account.isPostable && BALANCE_SHEET_CLASSES.includes(account.class))
      .sort((a, b) => a.code.localeCompare(b.code));

    const rows = postable.map((account) => {
      const totals = byAccount.get(account.id) ?? { debit: Money.ZERO, credit: Money.ZERO };
      const isCreditNormal = account.class !== "ASSET";
      const balance = isCreditNormal ? totals.credit.subtract(totals.debit) : totals.debit.subtract(totals.credit);
      return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        class: account.class,
        balance,
      };
    });

    const sumByClass = (cls: GlAccountClass): Money =>
      rows
        .filter((row) => row.class === cls)
        .reduce((sum, row) => sum.add(row.balance), Money.ZERO);

    const totalAssets = sumByClass("ASSET");
    const totalLiabilities = sumByClass("LIABILITY");
    const totalEquity = sumByClass("EQUITY");

    return {
      rows,
      totals: {
        totalAssets,
        totalLiabilities,
        totalEquity,
        difference: totalAssets.subtract(totalLiabilities.add(totalEquity)),
        balanced: totalAssets.equals(totalLiabilities.add(totalEquity)),
      },
      generatedAt: new Date(),
    };
  }
}

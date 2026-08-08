import { Injectable } from "@nestjs/common";
import { GlAccountRepository, GlPeriodAccountTotalRepository, GlPeriodRepository } from "../../../accounting";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface TrialBalanceParams {
  periodId: string;
}

interface AccountTotals {
  debit: Money;
  credit: Money;
}

/**
 * FR-RPT-008 report-of-record: every POSTABLE `gl_account`, with its
 * `debit_total`/`credit_total` summed from `gl_period_account_total` for the
 * given `periodId` — deliberately the SAME source `IntegritySweepService`
 * reconciles against (NFR-INT-002), never the `mv_income_expense` MV (that
 * view is INCOME/EXPENSE-only and Dashboard-scoped, see
 * `docs/phase-5/PROGRESS.md`'s Module 18 foundation-pass row).
 *
 * **Not cumulative** — unlike `BalanceSheetReport`, this reads ONLY the given
 * period's own `gl_period_account_total` rows (summed across every
 * `cost_center_id` for that account, since a Trial Balance is per-account,
 * not per-cost-center). A classic Trial Balance is often drawn as a
 * cumulative "as of" listing, but this schema's `gl_period_account_total` is
 * itself a per-period movement total (never a running balance — see that
 * entity's own doc comment), and the task brief is explicit that Trial
 * Balance reads "that period" only; `BalanceSheetReport`'s own doc comment
 * documents the contrasting cumulative-range design for ASSET/LIABILITY/
 * EQUITY accounts.
 *
 * **The debit=credit check is a VISIBLE computed `totals` field, never a
 * thrown error** (per the task brief) — `trg_gl_journal_balanced` already
 * guarantees every individual journal balances at commit (BR-GEN-02), so in
 * a healthy system `totals.balanced` is always `true`; a `false` here would
 * mean a genuine data-integrity problem (the same class of issue
 * `IntegritySweepService` hunts for), and the whole POINT of a Trial Balance
 * as a report-of-record is to surface that visibly to a human, not swallow
 * it behind an exception the caller never sees rendered.
 */
@Injectable()
export class TrialBalanceReport implements ReportDefinition<TrialBalanceParams> {
  readonly code = "trial-balance";
  readonly name = "Trial Balance";
  readonly domain = "accounting";
  readonly permissionCode = "reports:trial-balance:view";
  readonly paramsShape = { periodId: "uuid" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "accountCode", label: "Account Code", type: "string" },
    { key: "accountName", label: "Account Name", type: "string" },
    { key: "class", label: "Class", type: "string" },
    { key: "debit", label: "Debit", type: "money" },
    { key: "credit", label: "Credit", type: "money" },
  ];

  constructor(
    private readonly periodRepository: GlPeriodRepository,
    private readonly accountRepository: GlAccountRepository,
    private readonly periodAccountTotalRepository: GlPeriodAccountTotalRepository,
  ) {}

  async execute(params: TrialBalanceParams): Promise<ReportResult> {
    await this.periodRepository.findByIdOrFail(params.periodId);

    const [accounts, totalsRows] = await Promise.all([
      this.accountRepository.list(),
      this.periodAccountTotalRepository.listByPeriod(params.periodId),
    ]);

    const byAccount = new Map<string, AccountTotals>();
    for (const row of totalsRows) {
      const existing = byAccount.get(row.accountId) ?? { debit: Money.ZERO, credit: Money.ZERO };
      byAccount.set(row.accountId, {
        debit: existing.debit.add(row.debitTotal),
        credit: existing.credit.add(row.creditTotal),
      });
    }

    const postable = accounts.filter((account) => account.isPostable).sort((a, b) => a.code.localeCompare(b.code));

    let totalDebit = Money.ZERO;
    let totalCredit = Money.ZERO;
    const rows = postable.map((account) => {
      const totals = byAccount.get(account.id) ?? { debit: Money.ZERO, credit: Money.ZERO };
      totalDebit = totalDebit.add(totals.debit);
      totalCredit = totalCredit.add(totals.credit);
      return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        class: account.class,
        debit: totals.debit,
        credit: totals.credit,
      };
    });

    return {
      rows,
      totals: {
        debit: totalDebit,
        credit: totalCredit,
        difference: totalDebit.subtract(totalCredit),
        balanced: totalDebit.equals(totalCredit),
      },
      generatedAt: new Date(),
    };
  }
}

import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { GlAccountEntity, GlAccountRepository } from "../../../accounting";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface CashbookParams {
  fromDate: string;
  toDate: string;
}

interface RawLineRow {
  account_id: string;
  journal_date: string;
  journal_number: string;
  narration: string;
  memo: string | null;
  debit: string;
  credit: string;
}

/**
 * **Cash/bank account-filter judgement call (documented per the task
 * brief's own "your call, document it" instruction)**: `gl_account.control_domain`'s
 * CHECK enum (`GL_ACCOUNT_CONTROL_DOMAINS`) has no `CASH`/`BANK` value at
 * all — control domains exist for the sub-ledger-control-account accounts
 * this codebase's posting services resolve programmatically
 * (`AR_STUDENT`/`AR_SPONSOR`/`AP_SUPPLIER`/`WALLET`/`INVENTORY`/`PAYROLL`/
 * `PREPAYMENT`/`MPESA_CLEARING`/`TRANSFER_CLEARING`), never for ordinary
 * cash-in-hand/bank-current-account leaves — those are just plain, uncontrolled
 * ASSET accounts. There is therefore no query-able schema signal this report
 * could filter on. This is the SAME category of judgement call the accounting
 * seed's own clearing-account resolvers make elsewhere in this codebase
 * (`resolveControlAccount()` et al.) — here resolved as a hardcoded set of GL
 * ACCOUNT CODES, matching the actual cash/bank leaf accounts the accounting
 * seed (`0900-seed-permissions-and-roles.ts`'s `COA_TEMPLATE`) creates:
 * `1010` (Petty Cash), `1020` (Bank - Operating Account), `1030` (Cheques in
 * Transit), `1040` (Card/POS Clearing). A Settings-configurable list was
 * considered (a `set_config` row a school could edit without a code change)
 * but rejected for PASS A as unnecessary indirection — this report has no
 * `api/` layer yet (Pass B), so there is no live consumer that would benefit
 * from runtime configurability today; a future pass can swap this constant
 * for a `SettingsService.getTyped()` call without touching this report's
 * query shape at all. Any seeded code from this list that doesn't actually
 * exist in a given database (e.g. a minimal test fixture) is silently
 * skipped, not an error — a school's chart of accounts customization is not
 * this report's concern to validate.
 */
export const DEFAULT_CASHBOOK_ACCOUNT_CODES: readonly string[] = ["1010", "1020", "1030", "1040"];

/**
 * FR-RPT-008 report-of-record Cashbook — same shape as `GeneralLedgerReport`
 * (a `gl_journal_line`/`gl_journal` detail join, report-of-record, never any
 * materialized view), pre-filtered to the school's cash/bank-like leaf
 * accounts (see `DEFAULT_CASHBOOK_ACCOUNT_CODES`'s own doc comment for the
 * filter approach) instead of a single caller-chosen `accountId`.
 *
 * Rows from every matched account are merged into ONE chronologically-sorted
 * listing (a consolidated cashbook, the conventional shape — "the cashbook"
 * as a single book covering all cash/bank movement, not one book per
 * account) with a single combined running balance; `totals.byAccount` still
 * breaks out each account's own debit/credit/closing subtotal for a reader
 * who needs the per-account (per-book) figures FR-BANK-006 asks for
 * ("cashbook and bank book reports per account, per period, with running
 * balances").
 */
@Injectable()
export class CashbookReport implements ReportDefinition<CashbookParams> {
  readonly code = "cashbook";
  readonly name = "Cashbook";
  readonly domain = "accounting";
  readonly permissionCode = "reports:cashbook:view";
  readonly paramsShape = { fromDate: "date", toDate: "date" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "accountCode", label: "Account Code", type: "string" },
    { key: "accountName", label: "Account Name", type: "string" },
    { key: "journalDate", label: "Date", type: "date" },
    { key: "journalNumber", label: "Journal No.", type: "string" },
    { key: "narration", label: "Narration", type: "string" },
    { key: "memo", label: "Memo", type: "string" },
    { key: "debit", label: "Debit", type: "money" },
    { key: "credit", label: "Credit", type: "money" },
    { key: "runningBalance", label: "Balance", type: "money" },
  ];

  constructor(
    private readonly accountRepository: GlAccountRepository,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async execute(params: CashbookParams): Promise<ReportResult> {
    const candidates = await Promise.all(
      DEFAULT_CASHBOOK_ACCOUNT_CODES.map((code) => this.accountRepository.findByCode(code)),
    );
    const accounts = candidates.filter((account): account is GlAccountEntity => account !== null);

    if (accounts.length === 0) {
      return {
        rows: [],
        totals: { debit: Money.ZERO, credit: Money.ZERO, closingBalance: Money.ZERO, byAccount: {} },
        generatedAt: new Date(),
      };
    }

    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const accountIds = accounts.map((account) => account.id);

    const lineRows: RawLineRow[] = await this.dataSource.query(
      `SELECT jl.account_id, j.journal_date::text AS journal_date, j.number AS journal_number, j.narration,
              jl.memo, jl.debit, jl.credit
       FROM app.gl_journal_line jl
       JOIN app.gl_journal j ON j.id = jl.journal_id
       WHERE jl.account_id = ANY($1) AND j.journal_date >= $2 AND j.journal_date <= $3
       ORDER BY j.journal_date ASC, j.number ASC, jl.line_no ASC`,
      [accountIds, params.fromDate, params.toDate],
    );

    let runningBalance = Money.ZERO;
    let totalDebit = Money.ZERO;
    let totalCredit = Money.ZERO;
    const byAccount = new Map<string, { debit: Money; credit: Money }>();

    const rows = lineRows.map((row) => {
      const debit = Money.fromDecimalString(row.debit);
      const credit = Money.fromDecimalString(row.credit);
      runningBalance = runningBalance.add(debit).subtract(credit);
      totalDebit = totalDebit.add(debit);
      totalCredit = totalCredit.add(credit);

      const perAccount = byAccount.get(row.account_id) ?? { debit: Money.ZERO, credit: Money.ZERO };
      byAccount.set(row.account_id, { debit: perAccount.debit.add(debit), credit: perAccount.credit.add(credit) });

      const account = accountById.get(row.account_id);
      return {
        accountId: row.account_id,
        accountCode: account?.code ?? row.account_id,
        accountName: account?.name ?? "",
        journalDate: row.journal_date,
        journalNumber: row.journal_number,
        narration: row.narration,
        memo: row.memo,
        debit,
        credit,
        runningBalance,
      };
    });

    const byAccountTotals: Record<string, { accountCode: string; accountName: string; debit: Money; credit: Money; closingBalance: Money }> = {};
    for (const account of accounts) {
      const totals = byAccount.get(account.id) ?? { debit: Money.ZERO, credit: Money.ZERO };
      byAccountTotals[account.code] = {
        accountCode: account.code,
        accountName: account.name,
        debit: totals.debit,
        credit: totals.credit,
        closingBalance: totals.debit.subtract(totals.credit),
      };
    }

    return {
      rows,
      totals: {
        debit: totalDebit,
        credit: totalCredit,
        closingBalance: runningBalance,
        byAccount: byAccountTotals,
      },
      generatedAt: new Date(),
    };
  }
}

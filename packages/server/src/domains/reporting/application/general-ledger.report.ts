import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { GlAccountRepository } from "../../../accounting";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface GeneralLedgerParams {
  accountId: string;
  fromDate: string;
  toDate: string;
}

interface RawLineRow {
  journal_date: string;
  journal_number: string;
  narration: string;
  memo: string | null;
  debit: string;
  credit: string;
}

interface RawOpeningRow {
  debit: string;
  credit: string;
}

/**
 * FR-RPT-008 report-of-record — the true GL DETAIL view: every
 * `gl_journal_line` posted to a single account within a date range, joined to
 * `gl_journal` for date/number/narration. This is the "closest existing
 * precedent for cross-table GL aggregation query style" the task brief
 * pointed at (`IntegritySweepService.runSweep()`'s own `dataSource.query()`
 * join of `gl_journal_line`/`gl_journal`) — a raw SQL join rather than
 * `GlJournalLineRepository.listByAccount()` + a second lookup per journal,
 * both because `listByAccount()` has no date-range filter built in (it
 * returns EVERY line ever posted to the account, unbounded) and because a
 * single indexed join is the natural shape here, not N+1 journal lookups.
 *
 * **Opening balance**: computed as a SECOND raw query — `SUM(debit) -
 * SUM(credit)` for every line on this account dated strictly BEFORE
 * `fromDate` — so the detail rows' running balance starts from a real
 * carry-forward figure rather than zero (a genuine GL report always shows
 * "balance brought forward"). This is a live, always-current figure (same
 * caveat as every report in this pass — there is no historical point-in-time
 * ledger snapshot to query, only "everything posted so far").
 *
 * **Running balance** is computed in application code as a simple cumulative
 * `debit - credit` walk over the date-range rows, seeded from the opening
 * balance — the same convention `StdLedgerEntryRepository.getStatementWithRunningBalance()`
 * establishes for the student sub-ledger (there via a SQL window function;
 * here via a JS reduce, since the two extra values — opening balance plus a
 * date-bounded row set already in chronological order — make an in-app walk
 * just as simple as a second window-function query, and keeps the SQL itself
 * a plain, easy-to-read join). This is a presentation convenience, not a
 * stored/authoritative figure — `debit`/`credit` on each row remain the
 * ledger's own literal values.
 */
@Injectable()
export class GeneralLedgerReport implements ReportDefinition<GeneralLedgerParams> {
  readonly code = "general-ledger";
  readonly name = "General Ledger";
  readonly domain = "accounting";
  readonly permissionCode = "reports:general-ledger:view";
  readonly paramsShape = { accountId: "uuid", fromDate: "date", toDate: "date" } as const;
  readonly columns: ReportColumnDef[] = [
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

  async execute(params: GeneralLedgerParams): Promise<ReportResult> {
    const account = await this.accountRepository.findByIdOrFail(params.accountId);

    const openingRows: RawOpeningRow[] = await this.dataSource.query(
      `SELECT COALESCE(SUM(jl.debit), 0)::text AS debit, COALESCE(SUM(jl.credit), 0)::text AS credit
       FROM app.gl_journal_line jl
       JOIN app.gl_journal j ON j.id = jl.journal_id
       WHERE jl.account_id = $1 AND j.journal_date < $2`,
      [params.accountId, params.fromDate],
    );
    const openingBalance = Money.fromDecimalString(openingRows[0].debit).subtract(
      Money.fromDecimalString(openingRows[0].credit),
    );

    const lineRows: RawLineRow[] = await this.dataSource.query(
      `SELECT j.journal_date::text AS journal_date, j.number AS journal_number, j.narration,
              jl.memo, jl.debit, jl.credit
       FROM app.gl_journal_line jl
       JOIN app.gl_journal j ON j.id = jl.journal_id
       WHERE jl.account_id = $1 AND j.journal_date >= $2 AND j.journal_date <= $3
       ORDER BY j.journal_date ASC, j.number ASC, jl.line_no ASC`,
      [params.accountId, params.fromDate, params.toDate],
    );

    let runningBalance = openingBalance;
    let totalDebit = Money.ZERO;
    let totalCredit = Money.ZERO;
    const rows = lineRows.map((row) => {
      const debit = Money.fromDecimalString(row.debit);
      const credit = Money.fromDecimalString(row.credit);
      runningBalance = runningBalance.add(debit).subtract(credit);
      totalDebit = totalDebit.add(debit);
      totalCredit = totalCredit.add(credit);
      return {
        journalDate: row.journal_date,
        journalNumber: row.journal_number,
        narration: row.narration,
        memo: row.memo,
        debit,
        credit,
        runningBalance,
      };
    });

    return {
      rows,
      totals: {
        accountCode: account.code,
        accountName: account.name,
        openingBalance,
        debit: totalDebit,
        credit: totalCredit,
        closingBalance: runningBalance,
      },
      generatedAt: new Date(),
    };
  }
}

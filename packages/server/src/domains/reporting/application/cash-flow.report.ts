import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { GlAccountEntity, GlAccountRepository } from "../../../accounting";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { Money } from "../../../shared/money/money";
import { resolveControlAccount } from "../../billing";
import { DEFAULT_CASHBOOK_ACCOUNT_CODES } from "./cashbook.report";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface CashFlowParams {
  fromDate: string;
  toDate: string;
}

interface RawMovementRow {
  account_id: string;
  debit: string;
  credit: string;
}

/**
 * PASS B report-of-record for FR-DASH-002.1's Cash Flow KPI — `DashboardKpisService.getCashFlow()`
 * delegates directly to `execute()` here (see that service's own doc
 * comment) rather than re-deriving the figure from an MV, since no
 * materialized view in this schema carries a cash-in/cash-out shape.
 *
 * **Account universe**: the same `DEFAULT_CASHBOOK_ACCOUNT_CODES` set
 * `CashbookReport` uses (`1010`/`1020`/`1030`/`1040`), PLUS the
 * `MPESA_CLEARING` control-domain account (resolved via `domains/billing`'s
 * `resolveControlAccount()`) — M-Pesa collections sit in a clearing account
 * before settling to `1020`, so a cash-flow view that excluded it would
 * understate same-day mobile-money inflow. If `MPESA_CLEARING` has no
 * seeded, active, postable account (`resolveControlAccount()` throws
 * `NotFoundException`), it is silently excluded — the same "a seeded code
 * that doesn't exist in a given database is skipped, not an error"
 * tolerance `CashbookReport`'s own doc comment documents for its hardcoded
 * codes; a genuine CONFIGURATION error (more than one account tagged
 * `MPESA_CLEARING`) still propagates as `ConflictException`, never
 * swallowed.
 *
 * **Movement, not a listing** — unlike `CashbookReport` (one row per
 * `gl_journal_line`), this SUMS `debit`/`credit` per account within the date
 * range (a single `GROUP BY account_id` query): `cashIn` = period debit
 * total (cash/bank/M-Pesa-clearing accounts are ASSET, debit-normal, so a
 * debit is money flowing IN), `cashOut` = period credit total, `netCashFlow`
 * = `cashIn - cashOut`. One row per account plus a grand-total `totals`
 * field — the KPI's headline figure is `totals.netCashFlow`.
 */
@Injectable()
export class CashFlowReport implements ReportDefinition<CashFlowParams> {
  readonly code = "cash-flow";
  readonly name = "Cash Flow";
  readonly domain = "dashboard";
  readonly permissionCode = "reports:cash-flow:view";
  readonly paramsShape = { fromDate: "date", toDate: "date" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "accountCode", label: "Account Code", type: "string" },
    { key: "accountName", label: "Account Name", type: "string" },
    { key: "cashIn", label: "Cash In", type: "money" },
    { key: "cashOut", label: "Cash Out", type: "money" },
    { key: "netCashFlow", label: "Net Cash Flow", type: "money" },
  ];

  constructor(
    private readonly accountRepository: GlAccountRepository,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async execute(params: CashFlowParams): Promise<ReportResult> {
    const accounts = await this.resolveCashAccounts();

    if (accounts.length === 0) {
      return {
        rows: [],
        totals: { cashIn: Money.ZERO, cashOut: Money.ZERO, netCashFlow: Money.ZERO },
        generatedAt: new Date(),
      };
    }

    const accountIds = accounts.map((account) => account.id);
    const movementRows: RawMovementRow[] = await this.dataSource.query(
      `SELECT jl.account_id, COALESCE(SUM(jl.debit), 0)::text AS debit, COALESCE(SUM(jl.credit), 0)::text AS credit
       FROM app.gl_journal_line jl
       JOIN app.gl_journal j ON j.id = jl.journal_id
       WHERE jl.account_id = ANY($1) AND j.journal_date >= $2 AND j.journal_date <= $3
       GROUP BY jl.account_id`,
      [accountIds, params.fromDate, params.toDate],
    );
    const movementByAccount = new Map(movementRows.map((row) => [row.account_id, row]));

    let totalIn = Money.ZERO;
    let totalOut = Money.ZERO;
    const rows = accounts.map((account) => {
      const movement = movementByAccount.get(account.id);
      const cashIn = movement ? Money.fromDecimalString(movement.debit) : Money.ZERO;
      const cashOut = movement ? Money.fromDecimalString(movement.credit) : Money.ZERO;
      totalIn = totalIn.add(cashIn);
      totalOut = totalOut.add(cashOut);
      return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        cashIn,
        cashOut,
        netCashFlow: cashIn.subtract(cashOut),
      };
    });

    return {
      rows,
      totals: { cashIn: totalIn, cashOut: totalOut, netCashFlow: totalIn.subtract(totalOut) },
      generatedAt: new Date(),
    };
  }

  private async resolveCashAccounts(): Promise<GlAccountEntity[]> {
    const candidates = await Promise.all(
      DEFAULT_CASHBOOK_ACCOUNT_CODES.map((code) => this.accountRepository.findByCode(code)),
    );
    const accounts = candidates.filter((account): account is GlAccountEntity => account !== null);

    try {
      const mpesaClearing = await resolveControlAccount(this.accountRepository, "MPESA_CLEARING");
      if (!accounts.some((account) => account.id === mpesaClearing.id)) {
        accounts.push(mpesaClearing);
      }
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
      // No MPESA_CLEARING control account seeded — excluded, see class doc comment.
    }

    return accounts;
  }
}

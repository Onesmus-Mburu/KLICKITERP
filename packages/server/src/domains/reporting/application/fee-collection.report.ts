import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface FeeCollectionParams {
  fromDate: string;
  toDate: string;
}

interface RawCollectionRow {
  collection_date: string;
  method: string;
  amount: string;
}

/**
 * FR-RPT-008 report-of-record — the true, ledger-backed version of what
 * `mv_daily_collections` approximates for Dashboard speed (see that view's
 * own doc comment: "category dimension dropped... aspirational, not
 * load-bearing for the KPI"). This report reads `pay_receipt`
 * (`status = 'POSTED'`, excluding reversals) joined to `pay_receipt_split`
 * DIRECTLY, grouped by `(receipt_date, method)`, never the MV — the same
 * "never any materialized view" discipline every other report in this
 * module (Pass A's `CashbookReport`/`GeneralLedgerReport` included)
 * observes for report-of-record output.
 *
 * One row per `(date, method)`; `totals.grandTotal` and `totals.byMethod`
 * (a method -> `Money` breakdown, summed across every date in range) round
 * out the "with grand totals" shape the task brief asks for.
 */
@Injectable()
export class FeeCollectionReport implements ReportDefinition<FeeCollectionParams> {
  readonly code = "fee-collection";
  readonly name = "Fee Collection";
  readonly domain = "payments";
  readonly permissionCode = "reports:fee-collection:view";
  readonly paramsShape = { fromDate: "date", toDate: "date" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "collectionDate", label: "Date", type: "date" },
    { key: "method", label: "Method", type: "string" },
    { key: "amount", label: "Amount", type: "money" },
  ];

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(params: FeeCollectionParams): Promise<ReportResult> {
    const rawRows: RawCollectionRow[] = await this.dataSource.query(
      `SELECT r.receipt_date::text AS collection_date, s.method, COALESCE(SUM(s.amount), 0)::text AS amount
       FROM app.pay_receipt r
       JOIN app.pay_receipt_split s ON s.receipt_id = r.id
       WHERE r.status = 'POSTED' AND r.receipt_date >= $1 AND r.receipt_date <= $2
       GROUP BY r.receipt_date, s.method
       ORDER BY r.receipt_date ASC, s.method ASC`,
      [params.fromDate, params.toDate],
    );

    let grandTotal = Money.ZERO;
    const byMethod: Record<string, Money> = {};
    const rows = rawRows.map((row) => {
      const amount = Money.fromDecimalString(row.amount);
      grandTotal = grandTotal.add(amount);
      byMethod[row.method] = (byMethod[row.method] ?? Money.ZERO).add(amount);
      return { collectionDate: row.collection_date, method: row.method, amount };
    });

    return {
      rows,
      totals: { grandTotal, byMethod },
      generatedAt: new Date(),
    };
  }
}

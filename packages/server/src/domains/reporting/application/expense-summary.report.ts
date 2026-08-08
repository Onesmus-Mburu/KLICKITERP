import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface ExpenseSummaryParams {
  fromDate: string;
  toDate: string;
  categoryId?: string;
}

interface RawCategoryRow {
  category_id: string;
  category_name: string;
  voucher_count: string;
  total_amount: string;
}

/**
 * FR-RPT-008-adjacent report-of-record — `exp_voucher` totals grouped by
 * category for the given period, per the task brief.
 *
 * **Period-axis judgement call**: `exp_voucher` (see that entity's own doc
 * comment) carries no dedicated voucher/transaction date column at all —
 * only the standard `created_at`/`updated_at` audit columns every
 * `BaseEntity` row has. This report therefore uses `created_at::date` as the
 * period axis (documented here, since it is the one deviation from every
 * other report in this pass, which filter on a real business-date column
 * like `receipt_date`/`issue_date`/`invoice_date`) — the closest available
 * proxy for "when this expense was recorded," acceptable for a summary
 * rollup though not a perfect substitute for a genuine expense date field
 * (a gap this report did not introduce, only works around).
 *
 * `CANCELLED` vouchers are excluded — a cancelled voucher represents no
 * real spend, the same treatment `mv_ar_summary`/`mv_defaulters` give
 * `VOID` invoices.
 */
@Injectable()
export class ExpenseSummaryReport implements ReportDefinition<ExpenseSummaryParams> {
  readonly code = "expense-summary";
  readonly name = "Expense Summary";
  readonly domain = "expenses";
  readonly permissionCode = "reports:expense-summary:view";
  readonly paramsShape = { fromDate: "date", toDate: "date", categoryId: "uuid" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "categoryName", label: "Category", type: "string" },
    { key: "voucherCount", label: "Voucher Count", type: "number" },
    { key: "totalAmount", label: "Total", type: "money" },
  ];

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(params: ExpenseSummaryParams): Promise<ReportResult> {
    const conditions = ["v.created_at::date >= $1", "v.created_at::date <= $2", "v.status <> 'CANCELLED'"];
    const values: unknown[] = [params.fromDate, params.toDate];
    if (params.categoryId) {
      values.push(params.categoryId);
      conditions.push(`v.category_id = $${values.length}`);
    }

    const rawRows: RawCategoryRow[] = await this.dataSource.query(
      `SELECT v.category_id, c.name AS category_name, COUNT(*)::text AS voucher_count,
              COALESCE(SUM(v.amount), 0)::text AS total_amount
       FROM app.exp_voucher v
       JOIN app.exp_category c ON c.id = v.category_id
       WHERE ${conditions.join(" AND ")}
       GROUP BY v.category_id, c.name
       ORDER BY c.name ASC`,
      values,
    );

    let grandTotal = Money.ZERO;
    let totalCount = 0;
    const rows = rawRows.map((row) => {
      const totalAmount = Money.fromDecimalString(row.total_amount);
      const voucherCount = Number(row.voucher_count);
      grandTotal = grandTotal.add(totalAmount);
      totalCount += voucherCount;
      return {
        categoryId: row.category_id,
        categoryName: row.category_name,
        voucherCount,
        totalAmount,
      };
    });

    return {
      rows,
      totals: { grandTotal, voucherCount: totalCount },
      generatedAt: new Date(),
    };
  }
}

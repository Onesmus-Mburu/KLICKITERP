import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface InvoicesRegisterParams {
  fromDate: string;
  toDate: string;
  status?: string;
}

interface RawInvoiceRow {
  id: string;
  number: string;
  student_id: string;
  issue_date: string;
  due_date: string;
  status: string;
  total: string;
  paid_amount: string;
  balance: string;
}

/**
 * FR-RPT-008 report-of-record — a straightforward `bill_invoice` listing
 * for the given `issue_date` range, optionally filtered to one status
 * (any value from `BILL_INVOICE_STATUSES` — not validated against that enum
 * here, since an unmatched string simply returns zero rows, the same
 * tolerant behavior a raw `WHERE status = $3` always has).
 */
@Injectable()
export class InvoicesRegisterReport implements ReportDefinition<InvoicesRegisterParams> {
  readonly code = "invoices-register";
  readonly name = "Invoices Register";
  readonly domain = "billing";
  readonly permissionCode = "reports:invoices-register:view";
  readonly paramsShape = { fromDate: "date", toDate: "date", status: "string" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "number", label: "Invoice No.", type: "string" },
    { key: "studentId", label: "Student", type: "string" },
    { key: "issueDate", label: "Issue Date", type: "date" },
    { key: "dueDate", label: "Due Date", type: "date" },
    { key: "status", label: "Status", type: "string" },
    { key: "total", label: "Total", type: "money" },
    { key: "paidAmount", label: "Paid", type: "money" },
    { key: "balance", label: "Balance", type: "money" },
  ];

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(params: InvoicesRegisterParams): Promise<ReportResult> {
    const conditions = ["i.issue_date >= $1", "i.issue_date <= $2"];
    const values: unknown[] = [params.fromDate, params.toDate];
    if (params.status) {
      values.push(params.status);
      conditions.push(`i.status = $${values.length}`);
    }

    const rawRows: RawInvoiceRow[] = await this.dataSource.query(
      `SELECT i.id, i.number, i.student_id, i.issue_date::text AS issue_date, i.due_date::text AS due_date,
              i.status, i.total, i.paid_amount, i.balance
       FROM app.bill_invoice i
       WHERE ${conditions.join(" AND ")}
       ORDER BY i.issue_date ASC, i.number ASC`,
      values,
    );

    let totalAmount = Money.ZERO;
    let paidAmount = Money.ZERO;
    let balanceAmount = Money.ZERO;
    const rows = rawRows.map((row) => {
      const total = Money.fromDecimalString(row.total);
      const paid = Money.fromDecimalString(row.paid_amount);
      const balance = Money.fromDecimalString(row.balance);
      totalAmount = totalAmount.add(total);
      paidAmount = paidAmount.add(paid);
      balanceAmount = balanceAmount.add(balance);
      return {
        id: row.id,
        number: row.number,
        studentId: row.student_id,
        issueDate: row.issue_date,
        dueDate: row.due_date,
        status: row.status,
        total,
        paidAmount: paid,
        balance,
      };
    });

    return {
      rows,
      totals: { total: totalAmount, paidAmount, balance: balanceAmount, count: rows.length },
      generatedAt: new Date(),
    };
  }
}

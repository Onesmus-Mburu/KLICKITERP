import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface ReceiptsRegisterParams {
  fromDate: string;
  toDate: string;
  studentId?: string;
}

interface RawReceiptRow {
  id: string;
  number: string;
  receipt_date: string;
  student_id: string;
  payer_name: string;
  status: string;
  total: string;
}

/**
 * FR-RPT-008 report-of-record — a straightforward `pay_receipt` listing for
 * the given date range, optionally scoped to one student, per the task
 * brief. Every receipt in range is listed regardless of `status`
 * (`POSTED`/`REVERSED`) — a register is an audit trail, not a collections
 * total (that is `FeeCollectionReport`'s job) — but `runningTotal` only
 * accumulates `POSTED` rows: `pay_receipt.status` flips `POSTED -> REVERSED`
 * in place on the ORIGINAL receipt once reversed (see `PayReceiptEntity`'s
 * own doc comment), so including a since-reversed row's `total` in the
 * running balance would double-count money that was subsequently reversed
 * out via a separate contra receipt. `totals.total`/`totals.count` mirror
 * the same `POSTED`-only scope.
 */
@Injectable()
export class ReceiptsRegisterReport implements ReportDefinition<ReceiptsRegisterParams> {
  readonly code = "receipts-register";
  readonly name = "Receipts Register";
  readonly domain = "payments";
  readonly permissionCode = "reports:receipts-register:view";
  readonly paramsShape = { fromDate: "date", toDate: "date", studentId: "uuid" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "number", label: "Receipt No.", type: "string" },
    { key: "receiptDate", label: "Date", type: "date" },
    { key: "studentId", label: "Student", type: "string" },
    { key: "payerName", label: "Payer", type: "string" },
    { key: "status", label: "Status", type: "string" },
    { key: "total", label: "Total", type: "money" },
    { key: "runningTotal", label: "Running Total", type: "money" },
  ];

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(params: ReceiptsRegisterParams): Promise<ReportResult> {
    const conditions = ["r.receipt_date >= $1", "r.receipt_date <= $2"];
    const values: unknown[] = [params.fromDate, params.toDate];
    if (params.studentId) {
      values.push(params.studentId);
      conditions.push(`r.student_id = $${values.length}`);
    }

    const rawRows: RawReceiptRow[] = await this.dataSource.query(
      `SELECT r.id, r.number, r.receipt_date::text AS receipt_date, r.student_id, r.payer_name, r.status, r.total
       FROM app.pay_receipt r
       WHERE ${conditions.join(" AND ")}
       ORDER BY r.receipt_date ASC, r.number ASC`,
      values,
    );

    let runningTotal = Money.ZERO;
    let count = 0;
    const rows = rawRows.map((row) => {
      const total = Money.fromDecimalString(row.total);
      if (row.status === "POSTED") {
        runningTotal = runningTotal.add(total);
        count += 1;
      }
      return {
        id: row.id,
        number: row.number,
        receiptDate: row.receipt_date,
        studentId: row.student_id,
        payerName: row.payer_name,
        status: row.status,
        total,
        runningTotal,
      };
    });

    return {
      rows,
      totals: { total: runningTotal, count },
      generatedAt: new Date(),
    };
  }
}

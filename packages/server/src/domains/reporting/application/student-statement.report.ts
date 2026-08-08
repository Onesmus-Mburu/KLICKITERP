import { Injectable } from "@nestjs/common";
import { StudentLedgerService } from "../../students";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface StudentStatementParams {
  studentId: string;
}

/**
 * Per the task brief, this report is "mostly a thin wrapper" —
 * `domains/students`' `StudentLedgerService.getStatement(studentId)` ALREADY
 * returns a real report-of-record running-balance statement (it queries
 * `std_ledger_entry` directly via a SQL window function, see that service's
 * own doc comment) — there is no ledger aggregation logic to duplicate here,
 * only a mapping into the shared `ReportResult` shape. This is a genuine
 * cross-domain SERVICE call (not a raw entity read), per the task brief's
 * explicit instruction — `domains/reporting` was extended to import
 * `domains/students` in `module-deps.json` specifically for this.
 */
@Injectable()
export class StudentStatementReport implements ReportDefinition<StudentStatementParams> {
  readonly code = "student-statement";
  readonly name = "Student Statement";
  readonly domain = "students";
  readonly permissionCode = "reports:student-statement:view";
  readonly paramsShape = { studentId: "uuid" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "entryDate", label: "Date", type: "date" },
    { key: "docType", label: "Document Type", type: "string" },
    { key: "docNumber", label: "Document No.", type: "string" },
    { key: "memo", label: "Memo", type: "string" },
    { key: "debit", label: "Debit", type: "money" },
    { key: "credit", label: "Credit", type: "money" },
    { key: "runningBalance", label: "Balance", type: "money" },
  ];

  constructor(private readonly studentLedgerService: StudentLedgerService) {}

  async execute(params: StudentStatementParams): Promise<ReportResult> {
    const statement = await this.studentLedgerService.getStatement(params.studentId);

    let totalDebit = Money.ZERO;
    let totalCredit = Money.ZERO;
    const rows = statement.map((entry) => {
      totalDebit = totalDebit.add(entry.debit);
      totalCredit = totalCredit.add(entry.credit);
      return {
        entryDate: entry.entryDate,
        docType: entry.docType,
        docNumber: entry.docNumber,
        memo: entry.memo,
        debit: entry.debit,
        credit: entry.credit,
        runningBalance: entry.runningBalance,
      };
    });

    const closingBalance = statement.length > 0 ? statement[statement.length - 1].runningBalance : Money.ZERO;

    return {
      rows,
      totals: {
        debit: totalDebit,
        credit: totalCredit,
        closingBalance,
      },
      generatedAt: new Date(),
    };
  }
}

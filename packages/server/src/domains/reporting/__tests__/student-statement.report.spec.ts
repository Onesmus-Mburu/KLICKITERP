import { StudentStatementReport } from "../application/student-statement.report";
import { Money } from "../../../shared/money/money";
import type { StdLedgerStatementRow, StudentLedgerService } from "../../students";

function makeEntry(overrides: Partial<StdLedgerStatementRow>): StdLedgerStatementRow {
  return {
    id: "entry-1",
    studentId: "student-1",
    entryDate: "2026-01-05",
    postedAt: new Date("2026-01-05T10:00:00Z"),
    docType: "INVOICE",
    docId: "invoice-1",
    docNumber: "INV-0001",
    debit: Money.ZERO,
    credit: Money.ZERO,
    memo: null,
    runningBalance: Money.ZERO,
    ...overrides,
  };
}

describe("StudentStatementReport", () => {
  let studentLedgerService: { getStatement: jest.Mock };
  let report: StudentStatementReport;

  beforeEach(() => {
    studentLedgerService = { getStatement: jest.fn(async () => []) };
    report = new StudentStatementReport(studentLedgerService as unknown as StudentLedgerService);
  });

  it("delegates directly to StudentLedgerService.getStatement(studentId) — no ledger logic of its own", async () => {
    studentLedgerService.getStatement.mockResolvedValue([]);
    await report.execute({ studentId: "student-42" });
    expect(studentLedgerService.getStatement).toHaveBeenCalledWith("student-42");
    expect(studentLedgerService.getStatement).toHaveBeenCalledTimes(1);
  });

  it("maps the statement rows into ReportResult shape, preserving each row's own running balance", async () => {
    studentLedgerService.getStatement.mockResolvedValue([
      makeEntry({ debit: Money.fromInt(5000), credit: Money.ZERO, runningBalance: Money.fromInt(5000), docType: "INVOICE", docNumber: "INV-0001" }),
      makeEntry({ debit: Money.ZERO, credit: Money.fromInt(2000), runningBalance: Money.fromInt(3000), docType: "RECEIPT", docNumber: "RCT-0001" }),
    ]);

    const result = await report.execute({ studentId: "student-1" });

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ docType: "INVOICE", docNumber: "INV-0001" });
    expect((result.rows[1].runningBalance as Money).toDecimalString()).toBe("3000.0000");

    const totals = result.totals as { debit: Money; credit: Money; closingBalance: Money };
    expect(totals.debit.toDecimalString()).toBe("5000.0000");
    expect(totals.credit.toDecimalString()).toBe("2000.0000");
    // Closing balance = the LAST entry's own running balance, not debit - credit recomputed here.
    expect(totals.closingBalance.toDecimalString()).toBe("3000.0000");
  });

  it("closing balance is zero for a student with no ledger entries", async () => {
    studentLedgerService.getStatement.mockResolvedValue([]);
    const result = await report.execute({ studentId: "student-1" });
    const totals = result.totals as { closingBalance: Money };
    expect(totals.closingBalance.isZero()).toBe(true);
    expect(result.rows).toEqual([]);
  });
});

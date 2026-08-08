import { DataSource } from "typeorm";
import { ReceiptsRegisterReport } from "../application/receipts-register.report";
import { Money } from "../../../shared/money/money";

describe("ReceiptsRegisterReport", () => {
  let dataSource: { query: jest.Mock };
  let report: ReceiptsRegisterReport;

  beforeEach(() => {
    dataSource = { query: jest.fn(async () => []) };
    report = new ReceiptsRegisterReport(dataSource as unknown as DataSource);
  });

  it("lists every receipt in range but only accumulates the running total for POSTED rows", async () => {
    dataSource.query.mockResolvedValue([
      { id: "r1", number: "RCPT-001", receipt_date: "2026-01-05", student_id: "s1", payer_name: "Jane", status: "POSTED", total: "1000.0000" },
      { id: "r2", number: "RCPT-002", receipt_date: "2026-01-06", student_id: "s1", payer_name: "Jane", status: "REVERSED", total: "500.0000" },
      { id: "r3", number: "RCPT-003", receipt_date: "2026-01-07", student_id: "s2", payer_name: "John", status: "POSTED", total: "300.0000" },
    ]);

    const result = await report.execute({ fromDate: "2026-01-01", toDate: "2026-01-31" });

    expect(result.rows).toHaveLength(3);
    const rows = result.rows as Array<{ number: string; status: string; runningTotal: Money }>;
    expect(rows[0].runningTotal.toDecimalString()).toBe("1000.0000");
    expect(rows[1].runningTotal.toDecimalString()).toBe("1000.0000"); // REVERSED row doesn't move the running total
    expect(rows[2].runningTotal.toDecimalString()).toBe("1300.0000");

    const totals = result.totals as { total: Money; count: number };
    expect(totals.total.toDecimalString()).toBe("1300.0000");
    expect(totals.count).toBe(2);
  });

  it("adds a studentId filter clause + param only when studentId is given", async () => {
    await report.execute({ fromDate: "2026-01-01", toDate: "2026-01-31", studentId: "s1" });
    const [sqlWithFilter, paramsWithFilter] = dataSource.query.mock.calls[0];
    expect(sqlWithFilter).toContain("r.student_id = $3");
    expect(paramsWithFilter).toEqual(["2026-01-01", "2026-01-31", "s1"]);

    await report.execute({ fromDate: "2026-01-01", toDate: "2026-01-31" });
    const [sqlNoFilter, paramsNoFilter] = dataSource.query.mock.calls[1];
    expect(sqlNoFilter).not.toContain("r.student_id = $3"); // r.student_id is still a SELECTed column, just not filtered on
    expect(paramsNoFilter).toEqual(["2026-01-01", "2026-01-31"]);
  });
});

import { DataSource } from "typeorm";
import { InvoicesRegisterReport } from "../application/invoices-register.report";
import { Money } from "../../../shared/money/money";

describe("InvoicesRegisterReport", () => {
  let dataSource: { query: jest.Mock };
  let report: InvoicesRegisterReport;

  beforeEach(() => {
    dataSource = { query: jest.fn(async () => []) };
    report = new InvoicesRegisterReport(dataSource as unknown as DataSource);
  });

  it("lists invoices in range and sums total/paidAmount/balance", async () => {
    dataSource.query.mockResolvedValue([
      { id: "i1", number: "INV-001", student_id: "s1", issue_date: "2026-01-01", due_date: "2026-01-31", status: "PARTIALLY_PAID", total: "1000.0000", paid_amount: "400.0000", balance: "600.0000" },
      { id: "i2", number: "INV-002", student_id: "s2", issue_date: "2026-01-05", due_date: "2026-02-04", status: "PAID", total: "500.0000", paid_amount: "500.0000", balance: "0.0000" },
    ]);

    const result = await report.execute({ fromDate: "2026-01-01", toDate: "2026-01-31" });

    expect(result.rows).toHaveLength(2);
    const totals = result.totals as { total: Money; paidAmount: Money; balance: Money; count: number };
    expect(totals.total.toDecimalString()).toBe("1500.0000");
    expect(totals.paidAmount.toDecimalString()).toBe("900.0000");
    expect(totals.balance.toDecimalString()).toBe("600.0000");
    expect(totals.count).toBe(2);
  });

  it("adds a status filter clause + param only when status is given", async () => {
    await report.execute({ fromDate: "2026-01-01", toDate: "2026-01-31", status: "PAID" });
    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain("i.status = $3");
    expect(params).toEqual(["2026-01-01", "2026-01-31", "PAID"]);
  });
});

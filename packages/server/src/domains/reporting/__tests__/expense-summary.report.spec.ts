import { DataSource } from "typeorm";
import { ExpenseSummaryReport } from "../application/expense-summary.report";
import { Money } from "../../../shared/money/money";

describe("ExpenseSummaryReport", () => {
  let dataSource: { query: jest.Mock };
  let report: ExpenseSummaryReport;

  beforeEach(() => {
    dataSource = { query: jest.fn(async () => []) };
    report = new ExpenseSummaryReport(dataSource as unknown as DataSource);
  });

  it("groups voucher totals by category with a grand total and count", async () => {
    dataSource.query.mockResolvedValue([
      { category_id: "cat-1", category_name: "Utilities", voucher_count: "3", total_amount: "15000.0000" },
      { category_id: "cat-2", category_name: "Repairs", voucher_count: "1", total_amount: "5000.0000" },
    ]);

    const result = await report.execute({ fromDate: "2026-01-01", toDate: "2026-01-31" });

    expect(result.rows).toHaveLength(2);
    const totals = result.totals as { grandTotal: Money; voucherCount: number };
    expect(totals.grandTotal.toDecimalString()).toBe("20000.0000");
    expect(totals.voucherCount).toBe(4);

    const [sql] = dataSource.query.mock.calls[0];
    expect(sql).toContain("status <> 'CANCELLED'");
  });

  it("adds a categoryId filter clause + param only when categoryId is given", async () => {
    await report.execute({ fromDate: "2026-01-01", toDate: "2026-01-31", categoryId: "cat-1" });
    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain("v.category_id = $3");
    expect(params).toEqual(["2026-01-01", "2026-01-31", "cat-1"]);
  });
});

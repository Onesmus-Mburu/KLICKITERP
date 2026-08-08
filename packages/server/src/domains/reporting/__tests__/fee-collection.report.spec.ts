import { DataSource } from "typeorm";
import { FeeCollectionReport } from "../application/fee-collection.report";
import { Money } from "../../../shared/money/money";

describe("FeeCollectionReport", () => {
  let dataSource: { query: jest.Mock };
  let report: FeeCollectionReport;

  beforeEach(() => {
    dataSource = { query: jest.fn(async () => []) };
    report = new FeeCollectionReport(dataSource as unknown as DataSource);
  });

  it("groups POSTED collections by (date, method) and computes grand totals + a per-method breakdown", async () => {
    dataSource.query.mockResolvedValue([
      { collection_date: "2026-01-05", method: "CASH", amount: "500.0000" },
      { collection_date: "2026-01-05", method: "MPESA_STK", amount: "1200.0000" },
      { collection_date: "2026-01-06", method: "CASH", amount: "300.0000" },
    ]);

    const result = await report.execute({ fromDate: "2026-01-01", toDate: "2026-01-31" });

    expect(result.rows).toHaveLength(3);
    const totals = result.totals as { grandTotal: Money; byMethod: Record<string, Money> };
    expect(totals.grandTotal.toDecimalString()).toBe("2000.0000");
    expect(totals.byMethod.CASH.toDecimalString()).toBe("800.0000");
    expect(totals.byMethod.MPESA_STK.toDecimalString()).toBe("1200.0000");

    const [sql] = dataSource.query.mock.calls[0];
    expect(sql).toContain("status = 'POSTED'");
    expect(sql).toContain("app.pay_receipt");
    expect(sql).toContain("app.pay_receipt_split");
  });

  it("returns a zeroed result for an empty range", async () => {
    const result = await report.execute({ fromDate: "2026-02-01", toDate: "2026-02-28" });
    expect(result.rows).toEqual([]);
    const totals = result.totals as { grandTotal: Money };
    expect(totals.grandTotal.isZero()).toBe(true);
  });
});

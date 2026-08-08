import { DataSource } from "typeorm";
import { SupplierStatementReport } from "../application/supplier-statement.report";
import { Money } from "../../../shared/money/money";
import type { ProcSupplierEntity, ProcSupplierRepository } from "../../procurement";

describe("SupplierStatementReport", () => {
  let supplierRepository: { findByIdOrFail: jest.Mock };
  let dataSource: { query: jest.Mock };
  let report: SupplierStatementReport;

  beforeEach(() => {
    supplierRepository = {
      findByIdOrFail: jest.fn(async () => ({ id: "sup-1", name: "Acme Supplies" }) as ProcSupplierEntity),
    };
    dataSource = { query: jest.fn(async () => []) };
    report = new SupplierStatementReport(supplierRepository as unknown as ProcSupplierRepository, dataSource as unknown as DataSource);
  });

  it("computes a running balance across interleaved invoice charges and payment credits", async () => {
    dataSource.query.mockResolvedValue([
      { activity_date: "2026-01-05", activity_type: "INVOICE", reference: "SINV-001", charge: "10000.0000", payment: "0.0000" },
      { activity_date: "2026-01-10", activity_type: "PAYMENT", reference: "PV-001", charge: "0.0000", payment: "6000.0000" },
      { activity_date: "2026-01-15", activity_type: "INVOICE", reference: "SINV-002", charge: "4000.0000", payment: "0.0000" },
    ]);

    const result = await report.execute({ supplierId: "sup-1", fromDate: "2026-01-01", toDate: "2026-01-31" });

    expect(result.rows).toHaveLength(3);
    const rows = result.rows as Array<{ runningBalance: Money }>;
    expect(rows[0].runningBalance.toDecimalString()).toBe("10000.0000");
    expect(rows[1].runningBalance.toDecimalString()).toBe("4000.0000");
    expect(rows[2].runningBalance.toDecimalString()).toBe("8000.0000");

    const totals = result.totals as { supplierName: string; totalCharges: Money; totalPayments: Money; closingBalance: Money };
    expect(totals.supplierName).toBe("Acme Supplies");
    expect(totals.totalCharges.toDecimalString()).toBe("14000.0000");
    expect(totals.totalPayments.toDecimalString()).toBe("6000.0000");
    expect(totals.closingBalance.toDecimalString()).toBe("8000.0000");
  });
});

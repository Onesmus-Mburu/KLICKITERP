import { DataSource } from "typeorm";
import { GeneralLedgerReport } from "../application/general-ledger.report";
import { Money } from "../../../shared/money/money";
import type { GlAccountEntity } from "../../../accounting";

describe("GeneralLedgerReport", () => {
  let accountRepository: { findByIdOrFail: jest.Mock };
  let dataSource: { query: jest.Mock };
  let report: GeneralLedgerReport;

  beforeEach(() => {
    accountRepository = {
      findByIdOrFail: jest.fn(async () => ({ id: "acc-cash", code: "1010", name: "Petty Cash" }) as GlAccountEntity),
    };
    dataSource = { query: jest.fn() };
    report = new GeneralLedgerReport(accountRepository as never, dataSource as unknown as DataSource);
  });

  it("seeds the running balance from a pre-range opening balance, then walks debit-credit cumulatively through the detail rows", async () => {
    dataSource.query
      .mockResolvedValueOnce([{ debit: "500.0000", credit: "0.0000" }]) // opening balance query
      .mockResolvedValueOnce([
        { journal_date: "2026-01-05", journal_number: "GL-0001", narration: "Fee receipt", memo: null, debit: "200.0000", credit: "0.0000" },
        { journal_date: "2026-01-10", journal_number: "GL-0002", narration: "Bank charge", memo: "monthly fee", debit: "0.0000", credit: "50.0000" },
      ]); // detail rows query

    const result = await report.execute({ accountId: "acc-cash", fromDate: "2026-01-01", toDate: "2026-01-31" });

    expect(accountRepository.findByIdOrFail).toHaveBeenCalledWith("acc-cash");
    expect(result.rows).toHaveLength(2);
    expect((result.rows[0].runningBalance as Money).toDecimalString()).toBe("700.0000"); // 500 + 200
    expect((result.rows[1].runningBalance as Money).toDecimalString()).toBe("650.0000"); // 700 - 50

    const totals = result.totals as { openingBalance: Money; debit: Money; credit: Money; closingBalance: Money };
    expect(totals.openingBalance.toDecimalString()).toBe("500.0000");
    expect(totals.debit.toDecimalString()).toBe("200.0000");
    expect(totals.credit.toDecimalString()).toBe("50.0000");
    expect(totals.closingBalance.toDecimalString()).toBe("650.0000");
  });

  it("closing balance equals opening balance when there is no activity in range", async () => {
    dataSource.query.mockResolvedValueOnce([{ debit: "1000.0000", credit: "300.0000" }]).mockResolvedValueOnce([]);

    const result = await report.execute({ accountId: "acc-cash", fromDate: "2026-02-01", toDate: "2026-02-28" });

    expect(result.rows).toHaveLength(0);
    const totals = result.totals as { openingBalance: Money; closingBalance: Money };
    expect(totals.openingBalance.toDecimalString()).toBe("700.0000");
    expect(totals.closingBalance.toDecimalString()).toBe("700.0000");
  });
});

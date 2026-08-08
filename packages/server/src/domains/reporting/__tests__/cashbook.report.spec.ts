import { DataSource } from "typeorm";
import { CashbookReport } from "../application/cashbook.report";
import { Money } from "../../../shared/money/money";
import type { GlAccountEntity } from "../../../accounting";

const ACC_1010 = { id: "acc-1010", code: "1010", name: "Petty Cash" } as GlAccountEntity;
const ACC_1020 = { id: "acc-1020", code: "1020", name: "Bank - Operating Account" } as GlAccountEntity;

describe("CashbookReport", () => {
  let accountRepository: { findByCode: jest.Mock };
  let dataSource: { query: jest.Mock };
  let report: CashbookReport;

  beforeEach(() => {
    accountRepository = {
      findByCode: jest.fn(async (code: string) => {
        if (code === "1010") return ACC_1010;
        if (code === "1020") return ACC_1020;
        return null; // 1030/1040 not seeded in this synthetic fixture
      }),
    };
    dataSource = { query: jest.fn(async () => []) };
    report = new CashbookReport(accountRepository as never, dataSource as unknown as DataSource);
  });

  it("merges rows from every matched cash/bank account into one chronological listing with a combined running balance", async () => {
    dataSource.query.mockResolvedValue([
      { account_id: "acc-1010", journal_date: "2026-01-02", journal_number: "GL-01", narration: "Cash sale", memo: null, debit: "100.0000", credit: "0.0000" },
      { account_id: "acc-1020", journal_date: "2026-01-03", journal_number: "GL-02", narration: "Bank transfer in", memo: null, debit: "50.0000", credit: "0.0000" },
      { account_id: "acc-1010", journal_date: "2026-01-05", journal_number: "GL-03", narration: "Petty cash spend", memo: "supplies", debit: "0.0000", credit: "30.0000" },
    ]);

    const result = await report.execute({ fromDate: "2026-01-01", toDate: "2026-01-31" });

    expect(result.rows).toHaveLength(3);
    expect((result.rows[0].runningBalance as Money).toDecimalString()).toBe("100.0000");
    expect((result.rows[1].runningBalance as Money).toDecimalString()).toBe("150.0000");
    expect((result.rows[2].runningBalance as Money).toDecimalString()).toBe("120.0000");

    const totals = result.totals as {
      debit: Money;
      credit: Money;
      closingBalance: Money;
      byAccount: Record<string, { debit: Money; credit: Money; closingBalance: Money }>;
    };
    expect(totals.debit.toDecimalString()).toBe("150.0000");
    expect(totals.credit.toDecimalString()).toBe("30.0000");
    expect(totals.closingBalance.toDecimalString()).toBe("120.0000");
    expect(totals.byAccount["1010"].closingBalance.toDecimalString()).toBe("70.0000"); // 100 - 30
    expect(totals.byAccount["1020"].closingBalance.toDecimalString()).toBe("50.0000");

    // Queried only the accounts actually resolved (1010/1020), never the unseeded 1030/1040.
    const [, params] = dataSource.query.mock.calls[0];
    expect(params[0]).toEqual(["acc-1010", "acc-1020"]);
  });

  it("returns an empty, zeroed result when none of the default cash/bank codes resolve to a seeded account", async () => {
    accountRepository.findByCode.mockResolvedValue(null);

    const result = await report.execute({ fromDate: "2026-01-01", toDate: "2026-01-31" });

    expect(result.rows).toEqual([]);
    expect(dataSource.query).not.toHaveBeenCalled();
    const totals = result.totals as { debit: Money; credit: Money; closingBalance: Money };
    expect(totals.debit.isZero()).toBe(true);
    expect(totals.credit.isZero()).toBe(true);
    expect(totals.closingBalance.isZero()).toBe(true);
  });
});

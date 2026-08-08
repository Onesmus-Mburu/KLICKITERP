import { DataSource } from "typeorm";
import { CashFlowReport } from "../application/cash-flow.report";
import { Money } from "../../../shared/money/money";
import type { GlAccountEntity } from "../../../accounting";

const ACC_1010 = { id: "acc-1010", code: "1010", name: "Petty Cash" } as GlAccountEntity;
const ACC_1020 = { id: "acc-1020", code: "1020", name: "Bank - Operating Account" } as GlAccountEntity;
const ACC_MPESA = { id: "acc-mpesa", code: "1050", name: "M-Pesa Clearing", isActive: true, isPostable: true } as GlAccountEntity;

describe("CashFlowReport", () => {
  let accountRepository: { findByCode: jest.Mock; findByControlDomain: jest.Mock };
  let dataSource: { query: jest.Mock };
  let report: CashFlowReport;

  beforeEach(() => {
    accountRepository = {
      findByCode: jest.fn(async (code: string) => {
        if (code === "1010") return ACC_1010;
        if (code === "1020") return ACC_1020;
        return null;
      }),
      findByControlDomain: jest.fn(async () => [ACC_MPESA]),
    };
    dataSource = { query: jest.fn(async () => []) };
    report = new CashFlowReport(accountRepository as never, dataSource as unknown as DataSource);
  });

  it("sums debit (cash in) and credit (cash out) movement per account, including the resolved MPESA_CLEARING account", async () => {
    dataSource.query.mockResolvedValue([
      { account_id: "acc-1010", debit: "500.0000", credit: "100.0000" },
      { account_id: "acc-1020", debit: "1000.0000", credit: "400.0000" },
      { account_id: "acc-mpesa", debit: "300.0000", credit: "300.0000" },
    ]);

    const result = await report.execute({ fromDate: "2026-01-01", toDate: "2026-01-31" });

    expect(result.rows).toHaveLength(3);
    const byCode = new Map((result.rows as Array<{ accountCode: string; cashIn: Money; cashOut: Money; netCashFlow: Money }>).map((r) => [r.accountCode, r]));
    expect(byCode.get("1010")!.netCashFlow.toDecimalString()).toBe("400.0000");
    expect(byCode.get("1020")!.netCashFlow.toDecimalString()).toBe("600.0000");
    expect(byCode.get("1050")!.netCashFlow.toDecimalString()).toBe("0.0000");

    const totals = result.totals as { cashIn: Money; cashOut: Money; netCashFlow: Money };
    expect(totals.cashIn.toDecimalString()).toBe("1800.0000"); // 500+1000+300
    expect(totals.cashOut.toDecimalString()).toBe("800.0000"); // 100+400+300
    expect(totals.netCashFlow.toDecimalString()).toBe("1000.0000");
  });

  it("silently excludes MPESA_CLEARING when no control account is seeded (NotFoundException from resolveControlAccount)", async () => {
    accountRepository.findByControlDomain.mockResolvedValue([]);
    dataSource.query.mockResolvedValue([{ account_id: "acc-1010", debit: "50.0000", credit: "0.0000" }]);

    const result = await report.execute({ fromDate: "2026-01-01", toDate: "2026-01-31" });

    expect(result.rows).toHaveLength(2); // only the two resolved cashbook codes (1010/1020), no mpesa row
    const totals = result.totals as { cashIn: Money };
    expect(totals.cashIn.toDecimalString()).toBe("50.0000");
  });

  it("returns a zeroed result when no cash/bank/mpesa account resolves at all", async () => {
    accountRepository.findByCode.mockResolvedValue(null);
    accountRepository.findByControlDomain.mockResolvedValue([]);

    const result = await report.execute({ fromDate: "2026-01-01", toDate: "2026-01-31" });

    expect(result.rows).toEqual([]);
    expect(dataSource.query).not.toHaveBeenCalled();
    const totals = result.totals as { netCashFlow: Money };
    expect(totals.netCashFlow.isZero()).toBe(true);
  });
});

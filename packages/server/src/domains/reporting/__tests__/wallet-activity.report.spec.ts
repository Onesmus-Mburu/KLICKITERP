import { DataSource } from "typeorm";
import { WalletActivityReport } from "../application/wallet-activity.report";
import { Money } from "../../../shared/money/money";
import { MaterializedViewsRepository } from "../infrastructure/materialized-views.repository";
import { MvWalletLiabilityRow } from "../domain/mv-wallet-liability.view-entity";

describe("WalletActivityReport", () => {
  let dataSource: { query: jest.Mock };
  let mvRepository: { findWalletLiability: jest.Mock };
  let report: WalletActivityReport;

  beforeEach(() => {
    dataSource = { query: jest.fn(async () => []) };
    mvRepository = { findWalletLiability: jest.fn(async () => null) };
    report = new WalletActivityReport(dataSource as unknown as DataSource, mvRepository as unknown as MaterializedViewsRepository);
  });

  it("groups by (type, direction), computing net movement, and attaches the MV liability snapshot as a documented cross-check", async () => {
    dataSource.query.mockResolvedValue([
      { type: "TOPUP", direction: "C", txn_count: "5", total_amount: "10000.0000" },
      { type: "SPEND", direction: "D", txn_count: "8", total_amount: "3000.0000" },
    ]);
    const snapshot = new MvWalletLiabilityRow();
    snapshot.snapshotDate = "2026-07-20";
    snapshot.totalBalance = Money.fromInt(7000);
    mvRepository.findWalletLiability.mockResolvedValue(snapshot);

    const result = await report.execute({ fromDate: "2026-01-01", toDate: "2026-01-31" });

    expect(result.rows).toHaveLength(2);
    const totals = result.totals as {
      totalCredit: Money;
      totalDebit: Money;
      netMovement: Money;
      walletLiabilitySnapshot: { snapshotDate: string; totalBalance: Money } | null;
    };
    expect(totals.totalCredit.toDecimalString()).toBe("10000.0000");
    expect(totals.totalDebit.toDecimalString()).toBe("3000.0000");
    expect(totals.netMovement.toDecimalString()).toBe("7000.0000");
    expect(totals.walletLiabilitySnapshot!.snapshotDate).toBe("2026-07-20");
    expect(totals.walletLiabilitySnapshot!.totalBalance.toDecimalString()).toBe("7000.0000");
  });

  it("returns null walletLiabilitySnapshot when the MV has no row", async () => {
    const result = await report.execute({ fromDate: "2026-01-01", toDate: "2026-01-31" });
    const totals = result.totals as { walletLiabilitySnapshot: unknown };
    expect(totals.walletLiabilitySnapshot).toBeNull();
  });

  it("adds a walletId filter clause + param only when walletId is given", async () => {
    await report.execute({ fromDate: "2026-01-01", toDate: "2026-01-31", walletId: "w1" });
    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain("wallet_id = $3");
    expect(params[2]).toBe("w1");
  });
});

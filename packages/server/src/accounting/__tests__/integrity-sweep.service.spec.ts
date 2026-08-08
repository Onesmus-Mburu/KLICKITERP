import { DataSource } from "typeorm";
import { IntegritySweepService } from "../application/integrity-sweep.service";
import { Money } from "../../shared/money/money";
import { GlPeriodAccountTotalEntity } from "../domain/gl-period-account-total.entity";

function makeStoredRow(overrides: Partial<GlPeriodAccountTotalEntity>): GlPeriodAccountTotalEntity {
  return {
    id: "pat-1",
    periodId: "period-1",
    accountId: "acc-1",
    costCenterId: null,
    debitTotal: Money.ZERO,
    creditTotal: Money.ZERO,
    ...overrides,
  } as GlPeriodAccountTotalEntity;
}

describe("IntegritySweepService", () => {
  let dataSource: { query: jest.Mock };
  let periodAccountTotalRepository: { listAll: jest.Mock };
  let integrityRunRepository: { create: jest.Mock; listRecent: jest.Mock };
  let service: IntegritySweepService;

  beforeEach(() => {
    dataSource = { query: jest.fn(async () => []) };
    periodAccountTotalRepository = { listAll: jest.fn(async () => []) };
    integrityRunRepository = { create: jest.fn(async (data) => ({ id: "run-1", ...data })), listRecent: jest.fn() };

    service = new IntegritySweepService(
      dataSource as unknown as DataSource,
      periodAccountTotalRepository as never,
      integrityRunRepository as never,
    );
  });

  it("reports ok=true with no mismatches when derived and stored totals agree", async () => {
    dataSource.query.mockResolvedValue([
      { period_id: "period-1", account_id: "acc-1", cost_center_id: null, debit_total: "100.0000", credit_total: "0.0000" },
    ]);
    periodAccountTotalRepository.listAll.mockResolvedValue([
      makeStoredRow({ debitTotal: Money.fromInt(100), creditTotal: Money.ZERO }),
    ]);

    const result = await service.runSweep();

    expect(result.ok).toBe(true);
    expect((result.findings as { mismatchCount: number }).mismatchCount).toBe(0);
  });

  it("detects a mismatch when the stored total differs from the derived SUM", async () => {
    dataSource.query.mockResolvedValue([
      { period_id: "period-1", account_id: "acc-1", cost_center_id: null, debit_total: "150.0000", credit_total: "0.0000" },
    ]);
    periodAccountTotalRepository.listAll.mockResolvedValue([
      makeStoredRow({ debitTotal: Money.fromInt(100), creditTotal: Money.ZERO }),
    ]);

    const result = await service.runSweep();

    expect(result.ok).toBe(false);
    const findings = result.findings as { mismatchCount: number; mismatches: Array<{ accountId: string; stored: unknown; derived: unknown }> };
    expect(findings.mismatchCount).toBe(1);
    expect(findings.mismatches[0].accountId).toBe("acc-1");
    expect(findings.mismatches[0].stored).toEqual({ debitTotal: "100.0000", creditTotal: "0.0000" });
    expect(findings.mismatches[0].derived).toEqual({ debitTotal: "150.0000", creditTotal: "0.0000" });
  });

  it("detects a stored row with no backing journal lines (derived side missing)", async () => {
    dataSource.query.mockResolvedValue([]);
    periodAccountTotalRepository.listAll.mockResolvedValue([
      makeStoredRow({ debitTotal: Money.fromInt(50), creditTotal: Money.ZERO }),
    ]);

    const result = await service.runSweep();

    expect(result.ok).toBe(false);
    const findings = result.findings as { mismatches: Array<{ derived: unknown }> };
    expect(findings.mismatches[0].derived).toBeNull();
  });

  it("detects journal lines with no stored aggregate row (stored side missing)", async () => {
    dataSource.query.mockResolvedValue([
      { period_id: "period-1", account_id: "acc-2", cost_center_id: null, debit_total: "20.0000", credit_total: "0.0000" },
    ]);
    periodAccountTotalRepository.listAll.mockResolvedValue([]);

    const result = await service.runSweep();

    expect(result.ok).toBe(false);
    const findings = result.findings as { mismatches: Array<{ stored: unknown }> };
    expect(findings.mismatches[0].stored).toBeNull();
  });

  it("records the run via integrityRunRepository.create with kind + ranAt", async () => {
    await service.runSweep();
    expect(integrityRunRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "PERIOD_ACCOUNT_TOTAL_RECONCILIATION", ok: true }),
    );
  });
});

import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { Money } from "../../../shared/money/money";
import { StatutoryCalculationService } from "../application/statutory-calculation.service";
import { PyrlStatutoryTableEntity } from "../domain/pyrl-statutory-table.entity";

/**
 * SYNTHETIC rate tables for this test only — deliberately NOT real Kenyan
 * PAYE/NSSF/SHIF/AHL figures (Pass B owns the real seed). Numbers are chosen
 * so every multiplication divides exactly at Money's 4dp scale, isolating
 * the band/tier BOUNDARY logic under test from rounding-mode noise.
 */
function makeTable(overrides: Partial<PyrlStatutoryTableEntity>): PyrlStatutoryTableEntity {
  return {
    id: "table-1",
    kind: "PAYE",
    effectiveFrom: "2026-01-01",
    params: {},
    sourceNote: "synthetic test table",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    version: 1,
    ...overrides,
  } as PyrlStatutoryTableEntity;
}

const PAYE_PARAMS = {
  bands: [
    { min: 0, max: 10000, rate: 0.1 },
    { min: 10000, max: 20000, rate: 0.15 },
    { min: 20000, max: null, rate: 0.25 },
  ],
  personalReliefMonthly: 1000,
};

const NSSF_PARAMS = {
  tier1: { upperLimit: 6000, rate: 0.06 },
  tier2: { lowerLimit: 6000, upperLimit: 18000, rate: 0.06 },
};

const SHIF_PARAMS = { rate: 0.0275, minimumAmount: 300 };

const AHL_PARAMS = { employeeRate: 0.015, employerRate: 0.015 };

describe("StatutoryCalculationService", () => {
  let statutoryTablesService: { findEffectiveFor: jest.Mock };
  let service: StatutoryCalculationService;
  const periodEnd = new Date("2026-07-31T00:00:00.000Z");

  beforeEach(() => {
    statutoryTablesService = { findEffectiveFor: jest.fn() };
    service = new StatutoryCalculationService(statutoryTablesService as never);
  });

  describe("computePaye", () => {
    beforeEach(() => {
      statutoryTablesService.findEffectiveFor.mockImplementation(async (kind: string) => {
        if (kind !== "PAYE") throw new Error(`unexpected kind ${kind}`);
        return makeTable({ kind: "PAYE", params: PAYE_PARAMS });
      });
    });

    it("floors at zero when relief exceeds gross band tax (income entirely in band 1)", async () => {
      // (5000-0)*0.10 = 500; 500 - 1000 relief = -500 -> floored to 0.
      const result = await service.computePaye(Money.fromInt(5000), periodEnd);
      expect(result).toEqual(Money.ZERO);
      expect(statutoryTablesService.findEffectiveFor).toHaveBeenCalledWith("PAYE", "2026-07-31");
    });

    it("applies exactly one band at the lower boundary (income == band1 max)", async () => {
      // 10000 is NOT > band2's min (10000), so band2 contributes nothing.
      // (10000-0)*0.10 = 1000; 1000 - 1000 relief = 0.
      const result = await service.computePaye(Money.fromInt(10000), periodEnd);
      expect(result).toEqual(Money.ZERO);
    });

    it("crosses into band 2", async () => {
      // band1: 10000*0.10=1000; band2: (15000-10000)*0.15=750; gross=1750; net=1750-1000=750.
      const result = await service.computePaye(Money.fromInt(15000), periodEnd);
      expect(result).toEqual(Money.fromInt(750));
    });

    it("crosses into the unbounded top band", async () => {
      // band1: 1000; band2: 1500; band3: (30000-20000)*0.25=2500; gross=5000; net=5000-1000=4000.
      const result = await service.computePaye(Money.fromInt(30000), periodEnd);
      expect(result).toEqual(Money.fromInt(4000));
    });

    it("throws a named NotFoundException (BR-PYRL-01) when no PAYE table is effective", async () => {
      statutoryTablesService.findEffectiveFor.mockRejectedValueOnce(
        new NotFoundException("PyrlStatutoryTable", "no PAYE rate table effective on or before 2026-07-31 (BR-PYRL-01)"),
      );
      await expect(service.computePaye(Money.fromInt(10000), periodEnd)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("computeNssf", () => {
    beforeEach(() => {
      statutoryTablesService.findEffectiveFor.mockImplementation(async (kind: string) => {
        if (kind !== "NSSF") throw new Error(`unexpected kind ${kind}`);
        return makeTable({ kind: "NSSF", params: NSSF_PARAMS });
      });
    });

    it("tier 1 only, below the tier 1 upper limit", async () => {
      const result = await service.computeNssf(Money.fromInt(5000), periodEnd);
      expect(result.employee).toEqual(Money.fromInt(300));
      expect(result.employer).toEqual(Money.fromInt(300));
    });

    it("exactly at the tier 1/tier 2 boundary contributes nothing to tier 2", async () => {
      const result = await service.computeNssf(Money.fromInt(6000), periodEnd);
      expect(result.employee).toEqual(Money.fromInt(360));
      expect(result.employer).toEqual(Money.fromInt(360));
    });

    it("crosses into tier 2", async () => {
      // tier1: 6000*0.06=360; tier2: (10000-6000)*0.06=240; total=600.
      const result = await service.computeNssf(Money.fromInt(10000), periodEnd);
      expect(result.employee).toEqual(Money.fromInt(600));
      expect(result.employer).toEqual(Money.fromInt(600));
    });

    it("caps tier 2 at its upper limit", async () => {
      // tier1: 360; tier2: (18000-6000)*0.06=720 (pensionablePay 25000 exceeds tier2 upperLimit); total=1080.
      const result = await service.computeNssf(Money.fromInt(25000), periodEnd);
      expect(result.employee).toEqual(Money.fromInt(1080));
      expect(result.employer).toEqual(Money.fromInt(1080));
    });

    it("throws a named NotFoundException (BR-PYRL-01) when no NSSF table is effective", async () => {
      statutoryTablesService.findEffectiveFor.mockRejectedValueOnce(
        new NotFoundException("PyrlStatutoryTable", "no NSSF rate table effective on or before 2026-07-31 (BR-PYRL-01)"),
      );
      await expect(service.computeNssf(Money.fromInt(10000), periodEnd)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("computeShif", () => {
    beforeEach(() => {
      statutoryTablesService.findEffectiveFor.mockImplementation(async (kind: string) => {
        if (kind !== "SHIF") throw new Error(`unexpected kind ${kind}`);
        return makeTable({ kind: "SHIF", params: SHIF_PARAMS });
      });
    });

    it("applies the minimum-amount floor when the flat rate would fall below it", async () => {
      // 5000*0.0275=137.50, below the 300 floor.
      const result = await service.computeShif(Money.fromInt(5000), periodEnd);
      expect(result).toEqual(Money.fromDecimalString("300"));
    });

    it("uses the flat-rate result once it exceeds the floor", async () => {
      // 20000*0.0275=550.
      const result = await service.computeShif(Money.fromInt(20000), periodEnd);
      expect(result).toEqual(Money.fromInt(550));
    });

    it("throws a named NotFoundException (BR-PYRL-01) when no SHIF table is effective", async () => {
      statutoryTablesService.findEffectiveFor.mockRejectedValueOnce(
        new NotFoundException("PyrlStatutoryTable", "no SHIF rate table effective on or before 2026-07-31 (BR-PYRL-01)"),
      );
      await expect(service.computeShif(Money.fromInt(10000), periodEnd)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("computeAhl", () => {
    beforeEach(() => {
      statutoryTablesService.findEffectiveFor.mockImplementation(async (kind: string) => {
        if (kind !== "AHL") throw new Error(`unexpected kind ${kind}`);
        return makeTable({ kind: "AHL", params: AHL_PARAMS });
      });
    });

    it("computes employee and employer legs independently from the same gross pay", async () => {
      const result = await service.computeAhl(Money.fromInt(20000), periodEnd);
      expect(result.employee).toEqual(Money.fromInt(300));
      expect(result.employer).toEqual(Money.fromInt(300));
    });

    it("throws a named NotFoundException (BR-PYRL-01) when no AHL table is effective", async () => {
      statutoryTablesService.findEffectiveFor.mockRejectedValueOnce(
        new NotFoundException("PyrlStatutoryTable", "no AHL rate table effective on or before 2026-07-31 (BR-PYRL-01)"),
      );
      await expect(service.computeAhl(Money.fromInt(10000), periodEnd)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { Money } from "../../../shared/money/money";
import { GlPeriodEntity } from "../../../accounting";
import { DepreciationRunsService } from "../application/depreciation-runs.service";
import { FaAssetEntity } from "../domain/fa-asset.entity";
import { FaCategoryEntity } from "../domain/fa-category.entity";
import { FaDepreciationRunEntity } from "../domain/fa-depreciation-run.entity";
import { FaDepreciationLineEntity } from "../domain/fa-depreciation-line.entity";

function makeAsset(overrides: Partial<FaAssetEntity> = {}): FaAssetEntity {
  return {
    id: "asset-1",
    categoryId: "cat-sl",
    cost: Money.fromDecimalString("61000.00"),
    residualValue: Money.fromDecimalString("1000.00"),
    accumDepreciation: Money.ZERO,
    lifeMonthsOverride: null,
    inServiceFrom: "2020-01-01",
    status: "ACTIVE",
    ...overrides,
  } as FaAssetEntity;
}

function makeSlCategory(overrides: Partial<FaCategoryEntity> = {}): FaCategoryEntity {
  return {
    id: "cat-sl",
    name: "Furniture & Fittings",
    method: "SL",
    lifeMonths: 60,
    rate: null,
    residualPct: "0.0000",
    glCostAccountId: "cost-acc",
    glAccumDepAccountId: "accumdep-acc",
    glDepExpenseAccountId: "depexp-acc",
    ...overrides,
  } as FaCategoryEntity;
}

function makeRunPeriod(overrides: Partial<GlPeriodEntity> = {}): GlPeriodEntity {
  return { id: "period-1", seq: 1, startsOn: "2026-01-01", endsOn: "2026-01-31", ...overrides } as GlPeriodEntity;
}

function makeRun(overrides: Partial<FaDepreciationRunEntity> = {}): FaDepreciationRunEntity {
  return {
    id: "run-1",
    periodId: "period-1",
    status: "DRAFT",
    approvalRef: null,
    journalId: null,
    ...overrides,
  } as FaDepreciationRunEntity;
}

function makeLine(overrides: Partial<FaDepreciationLineEntity> = {}): FaDepreciationLineEntity {
  return {
    id: "line-1",
    runId: "run-1",
    assetId: "asset-1",
    amount: Money.fromDecimalString("1000.00"),
    nbvAfter: Money.fromDecimalString("59000.00"),
    ...overrides,
  } as FaDepreciationLineEntity;
}

describe("DepreciationRunsService", () => {
  let runRepository: { create: jest.Mock; save: jest.Mock; findByIdOrFail: jest.Mock; findByPeriodId: jest.Mock; list: jest.Mock };
  let lineRepository: { create: jest.Mock; findByRunId: jest.Mock };
  let assetRepository: { findActiveForDepreciation: jest.Mock; findByIdOrFail: jest.Mock; save: jest.Mock };
  let categoryRepository: { findByIdOrFail: jest.Mock };
  let periodRepository: { findByIdOrFail: jest.Mock };
  let postingService: { post: jest.Mock };
  let approvalEngine: { submit: jest.Mock; getStatus: jest.Mock };
  let service: DepreciationRunsService;

  const em = {} as EntityManager;

  beforeEach(() => {
    runRepository = {
      create: jest.fn(async (data) => makeRun(data)),
      save: jest.fn(async (e) => e),
      findByIdOrFail: jest.fn(async () => makeRun()),
      findByPeriodId: jest.fn(async () => null),
      list: jest.fn(async () => []),
    };
    lineRepository = {
      create: jest.fn(async (data) => makeLine(data)),
      findByRunId: jest.fn(async () => []),
    };
    assetRepository = {
      findActiveForDepreciation: jest.fn(async () => []),
      findByIdOrFail: jest.fn(async (id: string) => makeAsset({ id })),
      save: jest.fn(async (e) => e),
    };
    categoryRepository = { findByIdOrFail: jest.fn(async (id: string) => makeSlCategory({ id })) };
    periodRepository = { findByIdOrFail: jest.fn(async () => makeRunPeriod()) };
    postingService = { post: jest.fn(async () => ({ id: "journal-1", lines: [] })) };
    approvalEngine = {
      submit: jest.fn(async () => ({ id: "instance-1" })),
      getStatus: jest.fn(async () => ({ id: "instance-1", status: "APPROVED" })),
    };

    service = new DepreciationRunsService(
      runRepository as never,
      lineRepository as never,
      assetRepository as never,
      categoryRepository as never,
      periodRepository as never,
      postingService as never,
      approvalEngine as never,
    );
  });

  describe("createRun", () => {
    it("rejects when a run already exists for the period", async () => {
      runRepository.findByPeriodId.mockResolvedValue(makeRun());
      await expect(service.createRun(em, "period-1")).rejects.toBeInstanceOf(ConflictException);
    });

    it("SL: charges (cost-residual)/life_months for a fully in-service asset, no proration", async () => {
      // depreciableBase = 61000 - 1000 = 60000; 60000/60 = 1000.00 exactly
      assetRepository.findActiveForDepreciation.mockResolvedValue([makeAsset()]);

      await service.createRun(em, "period-1");

      expect(lineRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: "run-1",
          assetId: "asset-1",
          amount: Money.fromDecimalString("1000.00"),
          nbvAfter: Money.fromDecimalString("60000.00"), // 61000 - (0+1000)
        }),
        em,
      );
    });

    it("RB: charges nbv × rate / 12, re-derived from the asset's CURRENT accum_depreciation", async () => {
      // nbv = 100000 - 40000 = 60000; annual = 60000*0.20 = 12000; monthly = 1000.00
      const rbAsset = makeAsset({
        categoryId: "cat-rb",
        cost: Money.fromDecimalString("100000.00"),
        residualValue: Money.ZERO,
        accumDepreciation: Money.fromDecimalString("40000.00"),
      });
      assetRepository.findActiveForDepreciation.mockResolvedValue([rbAsset]);
      categoryRepository.findByIdOrFail.mockResolvedValue(
        makeSlCategory({ id: "cat-rb", method: "RB", rate: "0.200000", lifeMonths: 60 }),
      );

      await service.createRun(em, "period-1");

      expect(lineRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: Money.fromDecimalString("1000.00"),
          nbvAfter: Money.fromDecimalString("59000.00"), // 100000 - (40000+1000)
        }),
        em,
      );
    });

    it("prorates the FIRST period an asset enters service partway through (day-count: 16/31 of January)", async () => {
      // fullCharge = (61000-1000)/60 = 1000.00; ratio = 16/31 (Jan 16 through Jan 31 inclusive = 16 days of 31)
      // 1000.00 * 0.516129 = 516.1290 exactly
      const midPeriodAsset = makeAsset({ inServiceFrom: "2026-01-16" });
      assetRepository.findActiveForDepreciation.mockResolvedValue([midPeriodAsset]);

      await service.createRun(em, "period-1");

      expect(lineRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: Money.fromDecimalString("516.1290"),
          nbvAfter: Money.fromDecimalString("61000.00").subtract(Money.fromDecimalString("516.1290")),
        }),
        em,
      );
    });

    it("does NOT prorate a period strictly after the in-service month — full charge applies", async () => {
      const laterAsset = makeAsset({ inServiceFrom: "2025-06-16" }); // well before Jan 2026's period
      assetRepository.findActiveForDepreciation.mockResolvedValue([laterAsset]);

      await service.createRun(em, "period-1");

      expect(lineRepository.create).toHaveBeenCalledWith(expect.objectContaining({ amount: Money.fromDecimalString("1000.00") }), em);
    });

    it("BR-FA-01: caps the charge to the remaining headroom for a near-fully-depreciated asset", async () => {
      // depreciableBase = 10000-1000 = 9000; headroom = 9000-8900 = 100; fullCharge would be 9000/12=750.00, capped to 100.00
      const nearlyDone = makeAsset({
        cost: Money.fromDecimalString("10000.00"),
        residualValue: Money.fromDecimalString("1000.00"),
        accumDepreciation: Money.fromDecimalString("8900.00"),
      });
      assetRepository.findActiveForDepreciation.mockResolvedValue([nearlyDone]);
      categoryRepository.findByIdOrFail.mockResolvedValue(makeSlCategory({ lifeMonths: 12 }));

      await service.createRun(em, "period-1");

      expect(lineRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: Money.fromDecimalString("100.00"),
          nbvAfter: Money.fromDecimalString("1000.00"), // == residual_value, exactly at the cap
        }),
        em,
      );
    });

    it("BR-FA-01: skips an asset entirely (no line inserted) when headroom is already zero", async () => {
      const fullyDepreciated = makeAsset({
        cost: Money.fromDecimalString("5000.00"),
        residualValue: Money.fromDecimalString("500.00"),
        accumDepreciation: Money.fromDecimalString("4500.00"),
      });
      assetRepository.findActiveForDepreciation.mockResolvedValue([fullyDepreciated]);

      await service.createRun(em, "period-1");

      expect(lineRepository.create).not.toHaveBeenCalled();
    });

    it("skips an asset not yet in service during this period", async () => {
      const notYetInService = makeAsset({ inServiceFrom: "2026-02-01" }); // after period.endsOn (2026-01-31)
      assetRepository.findActiveForDepreciation.mockResolvedValue([notYetInService]);

      await service.createRun(em, "period-1");

      expect(lineRepository.create).not.toHaveBeenCalled();
    });
  });

  describe("submitForApproval", () => {
    it("sums line amounts as the DEPRECIATION approval amount", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "DRAFT" }));
      lineRepository.findByRunId.mockResolvedValue([
        makeLine({ id: "l1", amount: Money.fromDecimalString("100.00") }),
        makeLine({ id: "l2", amount: Money.fromDecimalString("250.00") }),
      ]);

      await service.submitForApproval(em, "run-1", "user-1");

      expect(approvalEngine.submit).toHaveBeenCalledWith(
        em,
        expect.objectContaining({ domainCode: "DEPRECIATION", entityType: "fa_depreciation_run", amount: Money.fromDecimalString("350.00") }),
      );
    });

    it("rejects submitting a non-DRAFT run", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "POSTED" }));
      await expect(service.submitForApproval(em, "run-1", "user-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects submitting a run with no lines", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "DRAFT" }));
      lineRepository.findByRunId.mockResolvedValue([]);
      await expect(service.submitForApproval(em, "run-1", "user-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("post", () => {
    beforeEach(() => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "PENDING_APPROVAL", approvalRef: "instance-1" }));
    });

    it("rejects a non-PENDING_APPROVAL run", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "DRAFT" }));
      await expect(service.post(em, "run-1", "poster-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects when the underlying appr_instance is not APPROVED", async () => {
      approvalEngine.getStatus.mockResolvedValue({ id: "instance-1", status: "PENDING" });
      await expect(service.post(em, "run-1", "poster-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("P-30: aggregates lines PER CATEGORY — one debit/credit pair per category, not per asset", async () => {
      // Two assets in cat-sl (100 + 200 = 300), one asset in cat-it.
      lineRepository.findByRunId.mockResolvedValue([
        makeLine({ id: "l1", assetId: "asset-1", amount: Money.fromDecimalString("100.00") }),
        makeLine({ id: "l2", assetId: "asset-2", amount: Money.fromDecimalString("200.00") }),
        makeLine({ id: "l3", assetId: "asset-3", amount: Money.fromDecimalString("50.00") }),
      ]);
      assetRepository.findByIdOrFail.mockImplementation(async (id: string) =>
        makeAsset({ id, categoryId: id === "asset-3" ? "cat-it" : "cat-sl" }),
      );
      categoryRepository.findByIdOrFail.mockImplementation(async (id: string) =>
        id === "cat-it"
          ? makeSlCategory({ id: "cat-it", name: "IT Equipment", glDepExpenseAccountId: "it-depexp", glAccumDepAccountId: "it-accumdep" })
          : makeSlCategory({ id: "cat-sl" }),
      );

      await service.post(em, "run-1", "poster-1");

      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: "depexp-acc", debit: Money.fromDecimalString("300.00"), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "accumdep-acc", debit: Money.ZERO, credit: Money.fromDecimalString("300.00") }),
            expect.objectContaining({ accountId: "it-depexp", debit: Money.fromDecimalString("50.00"), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "it-accumdep", debit: Money.ZERO, credit: Money.fromDecimalString("50.00") }),
          ],
        }),
      );

      // Every affected asset's accum_depreciation incremented by its own line amount.
      expect(assetRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "asset-1", accumDepreciation: Money.fromDecimalString("100.00") }),
        em,
      );
      expect(assetRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "asset-2", accumDepreciation: Money.fromDecimalString("200.00") }),
        em,
      );
    });

    it("sets status=POSTED and journal_id from the posted journal", async () => {
      lineRepository.findByRunId.mockResolvedValue([makeLine()]);
      const result = await service.post(em, "run-1", "poster-1");
      expect(result.status).toBe("POSTED");
      expect(result.journalId).toBe("journal-1");
    });
  });
});

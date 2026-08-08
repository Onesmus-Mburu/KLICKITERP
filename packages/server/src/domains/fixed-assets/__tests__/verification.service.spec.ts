import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { FaAssetEntity } from "../../fixed-assets/domain/fa-asset.entity";
import { VerificationService } from "../application/verification.service";
import { FaVerificationEntity } from "../domain/fa-verification.entity";
import { FaVerificationLineEntity } from "../domain/fa-verification-line.entity";

function makeVerification(overrides: Partial<FaVerificationEntity> = {}): FaVerificationEntity {
  return {
    id: "ver-1",
    number: "FAV-000001",
    scope: { assetIds: "ALL" },
    snapshotAt: new Date("2026-07-01T00:00:00.000Z"),
    status: "OPEN",
    approvalRef: null,
    journalId: null,
    ...overrides,
  } as FaVerificationEntity;
}

function makeLine(overrides: Partial<FaVerificationLineEntity> = {}): FaVerificationLineEntity {
  return {
    id: "line-1",
    verificationId: "ver-1",
    assetId: "asset-1",
    found: false,
    condition: null,
    notes: null,
    ...overrides,
  } as FaVerificationLineEntity;
}

describe("VerificationService", () => {
  let verificationRepository: { create: jest.Mock; save: jest.Mock; findByIdOrFail: jest.Mock; list: jest.Mock };
  let lineRepository: { create: jest.Mock; save: jest.Mock; findByIdOrFail: jest.Mock; findByVerificationId: jest.Mock };
  let assetRepository: { list: jest.Mock; findByIdOrFail: jest.Mock };
  let assetsService: { updateCondition: jest.Mock };
  let approvalEngine: { submit: jest.Mock; getStatus: jest.Mock };
  let numberingService: { allocate: jest.Mock };
  let service: VerificationService;

  const em = {} as EntityManager;

  beforeEach(() => {
    verificationRepository = {
      create: jest.fn(async (data) => makeVerification(data)),
      save: jest.fn(async (e) => e),
      findByIdOrFail: jest.fn(async () => makeVerification()),
      list: jest.fn(async () => []),
    };
    lineRepository = {
      create: jest.fn(async (data) => makeLine(data)),
      save: jest.fn(async (e) => e),
      findByIdOrFail: jest.fn(async () => makeLine()),
      findByVerificationId: jest.fn(async () => []),
    };
    assetRepository = {
      list: jest.fn(async () => []),
      findByIdOrFail: jest.fn(async (id: string) => ({ id } as FaAssetEntity)),
    };
    assetsService = { updateCondition: jest.fn(async () => ({})) };
    approvalEngine = {
      submit: jest.fn(async () => ({ id: "instance-1" })),
      getStatus: jest.fn(async () => ({ id: "instance-1", status: "APPROVED" })),
    };
    numberingService = { allocate: jest.fn(async () => "FAV-000001") };

    service = new VerificationService(
      verificationRepository as never,
      lineRepository as never,
      assetRepository as never,
      assetsService as never,
      approvalEngine as never,
      numberingService as never,
    );
  });

  describe("createSession", () => {
    it("scope.assetIds='ALL' snapshots every currently ACTIVE asset", async () => {
      assetRepository.list.mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
      await service.createSession(em, { assetIds: "ALL" }, "user-1");
      expect(assetRepository.list).toHaveBeenCalledWith({ status: "ACTIVE" }, em);
      expect(lineRepository.create).toHaveBeenCalledTimes(2);
    });

    it("rejects scope.assetIds='ALL' when there are no ACTIVE assets", async () => {
      assetRepository.list.mockResolvedValue([]);
      await expect(service.createSession(em, { assetIds: "ALL" }, "user-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects an empty explicit assetIds array", async () => {
      await expect(service.createSession(em, { assetIds: [] }, "user-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("every line starts found=false", async () => {
      await service.createSession(em, { assetIds: ["a1"] }, "user-1");
      expect(lineRepository.create).toHaveBeenCalledWith(expect.objectContaining({ assetId: "a1", found: false }), em);
    });
  });

  describe("recordCounts", () => {
    it("moves to COUNTING when not every line has been recorded yet (notes still null on another line)", async () => {
      lineRepository.findByVerificationId.mockResolvedValue([makeLine({ notes: "" }), makeLine({ id: "line-2", notes: null })]);
      const result = await service.recordCounts(em, "ver-1", [{ lineId: "line-1", found: true }], "user-1");
      expect(result.status).toBe("COUNTING");
    });

    it("moves to REVIEW once every line has notes !== null (the completeness signal)", async () => {
      lineRepository.findByVerificationId.mockResolvedValue([makeLine({ notes: "" }), makeLine({ id: "line-2", notes: "seen" })]);
      const result = await service.recordCounts(em, "ver-1", [{ lineId: "line-1", found: true }], "user-1");
      expect(result.status).toBe("REVIEW");
    });

    it("defaults an omitted notes to '' rather than leaving it null", async () => {
      await service.recordCounts(em, "ver-1", [{ lineId: "line-1", found: false }], "user-1");
      expect(lineRepository.save).toHaveBeenCalledWith(expect.objectContaining({ notes: "" }), em);
    });
  });

  describe("post", () => {
    beforeEach(() => {
      verificationRepository.findByIdOrFail.mockResolvedValue(makeVerification({ status: "PENDING_APPROVAL", approvalRef: "instance-1" }));
    });

    it("rejects a non-PENDING_APPROVAL session", async () => {
      verificationRepository.findByIdOrFail.mockResolvedValue(makeVerification({ status: "REVIEW" }));
      await expect(service.post(em, "ver-1", "poster-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects when the underlying appr_instance is not APPROVED", async () => {
      approvalEngine.getStatus.mockResolvedValue({ id: "instance-1", status: "PENDING" });
      await expect(service.post(em, "ver-1", "poster-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("compiles missingAssetIds from every found=false line, and applies condition updates for found lines", async () => {
      lineRepository.findByVerificationId.mockResolvedValue([
        makeLine({ id: "l1", assetId: "asset-1", found: true, condition: "GOOD" }),
        makeLine({ id: "l2", assetId: "asset-2", found: false }),
        makeLine({ id: "l3", assetId: "asset-3", found: false }),
        makeLine({ id: "l4", assetId: "asset-4", found: true, condition: "FAIR" }),
      ]);

      const result = await service.post(em, "ver-1", "poster-1");

      expect(result.missingAssetIds).toEqual(["asset-2", "asset-3"]);
      expect(assetsService.updateCondition).toHaveBeenCalledWith("asset-1", "GOOD", "poster-1", em);
      expect(assetsService.updateCondition).toHaveBeenCalledWith("asset-4", "FAIR", "poster-1", em);
      expect(assetsService.updateCondition).toHaveBeenCalledTimes(2);
      expect(result.verification.status).toBe("POSTED");
    });

    it("does NOT create a disposal or update condition for a found line with no condition recorded", async () => {
      lineRepository.findByVerificationId.mockResolvedValue([makeLine({ id: "l1", assetId: "asset-1", found: true, condition: null })]);
      const result = await service.post(em, "ver-1", "poster-1");
      expect(assetsService.updateCondition).not.toHaveBeenCalled();
      expect(result.missingAssetIds).toEqual([]);
    });

    it("compiles an empty missingAssetIds report when every asset was found (a clean session)", async () => {
      lineRepository.findByVerificationId.mockResolvedValue([makeLine({ id: "l1", found: true, condition: "GOOD" })]);
      const result = await service.post(em, "ver-1", "poster-1");
      expect(result.missingAssetIds).toEqual([]);
    });
  });
});

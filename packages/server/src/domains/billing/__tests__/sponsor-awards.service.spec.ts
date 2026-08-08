import { SponsorAwardsService } from "../application/sponsor-awards.service";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { BillSponsorAwardEntity } from "../domain/bill-sponsor-award.entity";

function makeAward(overrides: Partial<BillSponsorAwardEntity>): BillSponsorAwardEntity {
  return {
    id: "award-1",
    sponsorId: "sponsor-1",
    studentId: "student-1",
    termId: "term-1",
    amount: Money.fromInt(1000),
    categoryScope: null,
    appliedAmount: Money.ZERO,
    ...overrides,
  } as BillSponsorAwardEntity;
}

describe("SponsorAwardsService", () => {
  let awardRepository: {
    findByIdOrFail: jest.Mock;
    listByStudent: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    findActiveForStudent: jest.Mock;
  };
  let sponsorRepository: { findByIdOrFail: jest.Mock };
  let service: SponsorAwardsService;

  beforeEach(() => {
    awardRepository = {
      findByIdOrFail: jest.fn(async () => makeAward({})),
      listByStudent: jest.fn(async () => []),
      create: jest.fn(async (data) => makeAward(data)),
      save: jest.fn(async (e) => e),
      findActiveForStudent: jest.fn(async () => []),
    };
    sponsorRepository = { findByIdOrFail: jest.fn(async () => ({ id: "sponsor-1" })) };
    service = new SponsorAwardsService(awardRepository as never, sponsorRepository as never);
  });

  describe("create", () => {
    it("validates the sponsor exists", async () => {
      await service.create(
        { sponsorId: "sponsor-1", studentId: "student-1", termId: "term-1", amount: Money.fromInt(500) },
        "actor-1",
      );
      expect(sponsorRepository.findByIdOrFail).toHaveBeenCalledWith("sponsor-1");
    });

    it("rejects a non-positive amount", async () => {
      await expect(
        service.create(
          { sponsorId: "sponsor-1", studentId: "student-1", termId: "term-1", amount: Money.ZERO },
          "actor-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("update", () => {
    it("rejects lowering amount below already-applied", async () => {
      awardRepository.findByIdOrFail.mockResolvedValue(makeAward({ amount: Money.fromInt(1000), appliedAmount: Money.fromInt(600) }));
      await expect(service.update("award-1", { amount: Money.fromInt(500) }, "actor-1")).rejects.toBeInstanceOf(
        ValidationException,
      );
    });

    it("allows lowering amount down to (but not below) already-applied", async () => {
      awardRepository.findByIdOrFail.mockResolvedValue(makeAward({ amount: Money.fromInt(1000), appliedAmount: Money.fromInt(600) }));
      const updated = await service.update("award-1", { amount: Money.fromInt(600) }, "actor-1");
      expect(updated.amount.equals(Money.fromInt(600))).toBe(true);
    });
  });

  describe("findActiveCoverage", () => {
    it("maps each award to {award, remainingAmount, categoryScope}", async () => {
      awardRepository.findActiveForStudent.mockResolvedValue([
        makeAward({ id: "award-1", amount: Money.fromInt(1000), appliedAmount: Money.fromInt(300), categoryScope: ["cat-1"] }),
      ]);

      const coverage = await service.findActiveCoverage("student-1", "term-1");

      expect(awardRepository.findActiveForStudent).toHaveBeenCalledWith("student-1", "term-1");
      expect(coverage).toHaveLength(1);
      expect(coverage[0].award.id).toBe("award-1");
      expect(coverage[0].remainingAmount.equals(Money.fromInt(700))).toBe(true);
      expect(coverage[0].categoryScope).toEqual(["cat-1"]);
    });
  });
});

import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { LateFeePoliciesService } from "../application/late-fee-policies.service";
import { BillLateFeePolicyEntity } from "../domain/bill-late-fee-policy.entity";

function makePolicy(overrides: Partial<BillLateFeePolicyEntity>): BillLateFeePolicyEntity {
  return {
    id: "policy-1",
    name: "Standard 5% late fee",
    mode: "PERCENT",
    params: { rate: "0.05" },
    graceDays: 7,
    requiresApproval: false,
    isActive: true,
    ...overrides,
  } as BillLateFeePolicyEntity;
}

describe("LateFeePoliciesService", () => {
  let policyRepository: {
    findByName: jest.Mock;
    findByIdOrFail: jest.Mock;
    list: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let service: LateFeePoliciesService;

  beforeEach(() => {
    policyRepository = {
      findByName: jest.fn(async () => null),
      findByIdOrFail: jest.fn(async () => makePolicy({})),
      list: jest.fn(async () => [makePolicy({})]),
      create: jest.fn(async (data) => makePolicy(data)),
      save: jest.fn(async (e) => e),
    };
    service = new LateFeePoliciesService(policyRepository as never);
  });

  describe("create", () => {
    it("rejects a duplicate name", async () => {
      policyRepository.findByName.mockResolvedValue(makePolicy({}));
      await expect(
        service.create({ name: "Standard 5% late fee", mode: "PERCENT", params: { rate: "0.05" } }, "actor-1"),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("creates a new policy defaulting graceDays=0/requiresApproval=false/isActive=true", async () => {
      const policy = await service.create({ name: "Flat KES 200", mode: "FLAT", params: { amount: "200" } }, "actor-1");
      expect(policy.isActive).toBe(true);
      const created = policyRepository.create.mock.calls[0][0];
      expect(created.graceDays).toBe(0);
      expect(created.requiresApproval).toBe(false);
      expect(created.isActive).toBe(true);
      expect(created.createdBy).toBe("actor-1");
    });

    it("respects explicit graceDays/requiresApproval overrides", async () => {
      await service.create(
        { name: "Tiered late fee", mode: "TIERED", params: { tiers: [] }, graceDays: 14, requiresApproval: true },
        "actor-1",
      );
      const created = policyRepository.create.mock.calls[0][0];
      expect(created.graceDays).toBe(14);
      expect(created.requiresApproval).toBe(true);
    });
  });

  describe("findByIdOrFail / list", () => {
    it("delegates findByIdOrFail to the repository", async () => {
      await service.findByIdOrFail("policy-1");
      expect(policyRepository.findByIdOrFail).toHaveBeenCalledWith("policy-1");
    });

    it("delegates list to the repository", async () => {
      const result = await service.list();
      expect(policyRepository.list).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe("update", () => {
    it("only overwrites fields explicitly present in the input", async () => {
      policyRepository.findByIdOrFail.mockResolvedValue(makePolicy({ mode: "PERCENT", params: { rate: "0.05" }, graceDays: 7 }));
      const result = await service.update("policy-1", { graceDays: 10 }, "actor-2");
      expect(result.graceDays).toBe(10);
      expect(result.mode).toBe("PERCENT");
      expect(result.updatedBy).toBe("actor-2");
    });

    it("overwrites mode/params/requiresApproval when present", async () => {
      policyRepository.findByIdOrFail.mockResolvedValue(makePolicy({}));
      const result = await service.update(
        "policy-1",
        { mode: "FLAT", params: { amount: "500" }, requiresApproval: true },
        "actor-2",
      );
      expect(result.mode).toBe("FLAT");
      expect(result.params).toEqual({ amount: "500" });
      expect(result.requiresApproval).toBe(true);
    });
  });

  describe("deactivate / activate", () => {
    it("deactivate() flips isActive to false", async () => {
      policyRepository.findByIdOrFail.mockResolvedValue(makePolicy({ isActive: true }));
      const result = await service.deactivate("policy-1", "actor-3");
      expect(result.isActive).toBe(false);
      expect(result.updatedBy).toBe("actor-3");
    });

    it("activate() flips isActive to true", async () => {
      policyRepository.findByIdOrFail.mockResolvedValue(makePolicy({ isActive: false }));
      const result = await service.activate("policy-1", "actor-3");
      expect(result.isActive).toBe(true);
    });
  });
});

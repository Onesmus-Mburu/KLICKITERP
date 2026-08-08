import { DelegationsService } from "../application/delegations.service";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { ApprDelegationEntity } from "../domain/appr-delegation.entity";

function makeDelegation(overrides: Partial<ApprDelegationEntity>): ApprDelegationEntity {
  return {
    id: "deleg-1",
    fromUserId: "user-a",
    toUserId: "user-b",
    startsOn: "2026-01-01",
    endsOn: "2026-01-31",
    reason: null,
    ...overrides,
  } as ApprDelegationEntity;
}

describe("DelegationsService", () => {
  let delegationRepository: {
    create: jest.Mock;
    findByIdOrFail: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    listByFromUser: jest.Mock;
    list: jest.Mock;
  };
  let service: DelegationsService;

  beforeEach(() => {
    delegationRepository = {
      create: jest.fn(async (data: Partial<ApprDelegationEntity>) => makeDelegation(data)),
      findByIdOrFail: jest.fn(),
      save: jest.fn(async (e: ApprDelegationEntity) => e),
      delete: jest.fn(async () => undefined),
      listByFromUser: jest.fn(async () => []),
      list: jest.fn(async () => []),
    };
    service = new DelegationsService(delegationRepository as never);
  });

  describe("create", () => {
    it("rejects delegating to oneself", async () => {
      await expect(
        service.create({ fromUserId: "user-a", toUserId: "user-a", startsOn: "2026-01-01", endsOn: "2026-01-31" }, "actor-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects startsOn after endsOn", async () => {
      await expect(
        service.create({ fromUserId: "user-a", toUserId: "user-b", startsOn: "2026-02-01", endsOn: "2026-01-01" }, "actor-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("creates a valid delegation", async () => {
      const created = await service.create(
        { fromUserId: "user-a", toUserId: "user-b", startsOn: "2026-01-01", endsOn: "2026-01-31" },
        "actor-1",
      );
      expect(created.fromUserId).toBe("user-a");
      expect(created.toUserId).toBe("user-b");
    });
  });

  describe("resolveEffectiveApprover", () => {
    it("returns the delegate when a delegation is active on the given date", async () => {
      delegationRepository.listByFromUser.mockResolvedValue([
        makeDelegation({ fromUserId: "user-a", toUserId: "user-b", startsOn: "2026-01-01", endsOn: "2026-01-31" }),
      ]);
      const result = await service.resolveEffectiveApprover("user-a", new Date("2026-01-15T00:00:00Z"));
      expect(result).toBe("user-b");
    });

    it("returns the original user when no delegation is active on the given date", async () => {
      delegationRepository.listByFromUser.mockResolvedValue([
        makeDelegation({ fromUserId: "user-a", toUserId: "user-b", startsOn: "2026-01-01", endsOn: "2026-01-31" }),
      ]);
      const result = await service.resolveEffectiveApprover("user-a", new Date("2026-02-15T00:00:00Z"));
      expect(result).toBe("user-a");
    });

    it("returns the original user when there are no delegation rows at all", async () => {
      delegationRepository.listByFromUser.mockResolvedValue([]);
      const result = await service.resolveEffectiveApprover("user-a", new Date("2026-01-15T00:00:00Z"));
      expect(result).toBe("user-a");
    });

    it("is one-hop only — does not chase the delegate's own delegations", async () => {
      // user-a -> user-b (active), user-b -> user-c (also active) — resolving user-a should stop at user-b.
      delegationRepository.listByFromUser.mockImplementation(async (fromUserId: string) => {
        if (fromUserId === "user-a") {
          return [makeDelegation({ fromUserId: "user-a", toUserId: "user-b", startsOn: "2026-01-01", endsOn: "2026-01-31" })];
        }
        return [];
      });
      const result = await service.resolveEffectiveApprover("user-a", new Date("2026-01-15T00:00:00Z"));
      expect(result).toBe("user-b");
      expect(delegationRepository.listByFromUser).toHaveBeenCalledTimes(1);
      expect(delegationRepository.listByFromUser).toHaveBeenCalledWith("user-a");
    });
  });

  describe("update", () => {
    it("rejects an update that would make startsOn after endsOn", async () => {
      delegationRepository.findByIdOrFail.mockResolvedValue(
        makeDelegation({ startsOn: "2026-01-01", endsOn: "2026-01-31" }),
      );
      await expect(service.update("deleg-1", { startsOn: "2026-02-01" }, "actor-1")).rejects.toBeInstanceOf(
        ValidationException,
      );
    });
  });
});

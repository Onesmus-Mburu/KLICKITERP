import { DataSource, EntityManager } from "typeorm";
import { ApprovalEngineService } from "../application/approval-engine.service";
import { AuthorizationException } from "../../../shared/exceptions/authorization.exception";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { ApprInstanceEntity } from "../domain/appr-instance.entity";
import { ApprLevelEntity } from "../domain/appr-level.entity";
import { ApprRoutingRuleEntity } from "../domain/appr-routing-rule.entity";

function makeLevel(overrides: Partial<ApprLevelEntity>): ApprLevelEntity {
  return {
    id: `level-${overrides.seq}`,
    workflowVersionId: "ver-1",
    seq: 1,
    approverType: "ROLE",
    roleId: null,
    userIds: null,
    mode: "SEQUENTIAL",
    quorum: 1,
    slaHours: null,
    escalation: null,
    ...overrides,
  } as ApprLevelEntity;
}

function makeRule(overrides: Partial<ApprRoutingRuleEntity>): ApprRoutingRuleEntity {
  return {
    id: "rule-1",
    workflowVersionId: "ver-1",
    minAmount: Money.fromInt(0),
    maxAmount: null,
    levelSubset: null,
    departmentId: null,
    ...overrides,
  } as ApprRoutingRuleEntity;
}

function makeInstance(overrides: Partial<ApprInstanceEntity>): ApprInstanceEntity {
  return {
    id: "inst-1",
    workflowVersionId: "ver-1",
    domainCode: "TEST_DOMAIN",
    entityType: "test_entity",
    entityId: "entity-1",
    amount: Money.fromInt(100),
    initiatorId: "initiator-1",
    status: "PENDING",
    currentLevel: 1,
    submittedAt: new Date(),
    decidedAt: null,
    ...overrides,
  } as ApprInstanceEntity;
}

describe("ApprovalEngineService", () => {
  let dataSource: DataSource;
  let workflowDefRepository: { findByDomainCode: jest.Mock };
  let workflowVersionRepository: { findCurrent: jest.Mock };
  let levelRepository: { listByVersion: jest.Mock };
  let routingRuleRepository: { listByVersion: jest.Mock };
  let instanceRepository: {
    create: jest.Mock;
    findByIdOrFail: jest.Mock;
    save: jest.Mock;
    findLatestByEntity: jest.Mock;
    list: jest.Mock;
    listPending: jest.Mock;
  };
  let actionRepository: { create: jest.Mock; listByInstance: jest.Mock; countApprovalsAtLevel: jest.Mock };
  let usersService: { findByIdOrFail: jest.Mock; listActiveUsersByRoleId: jest.Mock };
  let departmentsService: { findByIdOrFail: jest.Mock };
  let delegationsService: { resolveEffectiveApprover: jest.Mock };
  let outboxWriter: { write: jest.Mock };
  let service: ApprovalEngineService;

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;

    workflowDefRepository = { findByDomainCode: jest.fn() };
    workflowVersionRepository = { findCurrent: jest.fn() };
    levelRepository = { listByVersion: jest.fn() };
    routingRuleRepository = { listByVersion: jest.fn(async () => []) };
    instanceRepository = {
      create: jest.fn(async (data: Partial<ApprInstanceEntity>) => makeInstance(data)),
      findByIdOrFail: jest.fn(),
      save: jest.fn(async (e: ApprInstanceEntity) => e),
      findLatestByEntity: jest.fn(),
      list: jest.fn(),
      listPending: jest.fn(async () => []),
    };
    actionRepository = {
      create: jest.fn(async () => undefined),
      listByInstance: jest.fn(),
      countApprovalsAtLevel: jest.fn(async () => 0),
    };
    usersService = {
      findByIdOrFail: jest.fn(async (id: string) => ({ id, departmentId: null })),
      listActiveUsersByRoleId: jest.fn(async () => []),
    };
    departmentsService = { findByIdOrFail: jest.fn() };
    delegationsService = { resolveEffectiveApprover: jest.fn(async (userId: string) => userId) };
    outboxWriter = { write: jest.fn(async () => undefined) };

    service = new ApprovalEngineService(
      dataSource,
      workflowDefRepository as never,
      workflowVersionRepository as never,
      levelRepository as never,
      routingRuleRepository as never,
      instanceRepository as never,
      actionRepository as never,
      usersService as never,
      departmentsService as never,
      delegationsService as never,
      outboxWriter as never,
    );
  });

  describe("submit", () => {
    beforeEach(() => {
      workflowDefRepository.findByDomainCode.mockResolvedValue({ id: "def-1", isActive: true });
      workflowVersionRepository.findCurrent.mockResolvedValue({ id: "ver-1", workflowDefId: "def-1" });
      levelRepository.listByVersion.mockResolvedValue([
        makeLevel({ seq: 1 }),
        makeLevel({ seq: 2 }),
        makeLevel({ seq: 3 }),
      ]);
    });

    it("picks the level_subset from the matching routing rule (min inclusive, max exclusive)", async () => {
      routingRuleRepository.listByVersion.mockResolvedValue([
        makeRule({ minAmount: Money.fromInt(0), maxAmount: Money.fromInt(1000), levelSubset: [1] }),
        makeRule({ id: "rule-2", minAmount: Money.fromInt(1000), maxAmount: null, levelSubset: [2, 3] }),
      ]);

      const created = await service.submit({} as EntityManager, {
        domainCode: "TEST_DOMAIN",
        entityType: "test_entity",
        entityId: "entity-1",
        amount: Money.fromInt(1500),
        initiatorId: "initiator-1",
      });

      // amount=1500 matches rule-2 (levelSubset [2,3]) -> first applicable level is seq=2
      expect(created.currentLevel).toBe(2);
    });

    it("falls back to ALL levels when no routing rule matches", async () => {
      routingRuleRepository.listByVersion.mockResolvedValue([
        makeRule({ minAmount: Money.fromInt(0), maxAmount: Money.fromInt(100), levelSubset: [3] }),
      ]);

      const created = await service.submit({} as EntityManager, {
        domainCode: "TEST_DOMAIN",
        entityType: "test_entity",
        entityId: "entity-1",
        amount: Money.fromInt(5000), // outside the only rule's range
        initiatorId: "initiator-1",
      });

      expect(created.currentLevel).toBe(1); // first of ALL levels
    });

    it("falls back to ALL levels when amount is null", async () => {
      routingRuleRepository.listByVersion.mockResolvedValue([
        makeRule({ minAmount: Money.fromInt(0), maxAmount: null, levelSubset: [3] }),
      ]);

      const created = await service.submit({} as EntityManager, {
        domainCode: "TEST_DOMAIN",
        entityType: "test_entity",
        entityId: "entity-1",
        amount: null,
        initiatorId: "initiator-1",
      });

      expect(created.currentLevel).toBe(1);
    });

    it("surfaces a one-PENDING-per-entity unique-violation as ConflictException", async () => {
      instanceRepository.create.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));

      await expect(
        service.submit({} as EntityManager, {
          domainCode: "TEST_DOMAIN",
          entityType: "test_entity",
          entityId: "entity-1",
          amount: Money.fromInt(100),
          initiatorId: "initiator-1",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects when no active workflow def is registered for the domain code", async () => {
      workflowDefRepository.findByDomainCode.mockResolvedValue(null);
      await expect(
        service.submit({} as EntityManager, {
          domainCode: "UNKNOWN",
          entityType: "test_entity",
          entityId: "entity-1",
          initiatorId: "initiator-1",
        }),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("decide — authorization", () => {
    beforeEach(() => {
      levelRepository.listByVersion.mockResolvedValue([makeLevel({ seq: 1 })]);
    });

    it("authorizes a ROLE-type level via UsersService.listActiveUsersByRoleId", async () => {
      levelRepository.listByVersion.mockResolvedValue([makeLevel({ seq: 1, approverType: "ROLE", roleId: "role-1" })]);
      usersService.listActiveUsersByRoleId.mockResolvedValue([{ id: "approver-1" }]);
      instanceRepository.findByIdOrFail.mockResolvedValue(makeInstance({ currentLevel: 1 }));

      const result = await service.decide("inst-1", "approver-1", "APPROVE");

      expect(result.status).toBe("APPROVED"); // single level, SEQUENTIAL, one approve -> done
      expect(actionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: "approver-1", wasDelegatedFrom: null }),
        expect.anything(),
      );
    });

    it("authorizes a USERS-type level via user_ids membership", async () => {
      levelRepository.listByVersion.mockResolvedValue([
        makeLevel({ seq: 1, approverType: "USERS", userIds: ["approver-a", "approver-b"] }),
      ]);
      instanceRepository.findByIdOrFail.mockResolvedValue(makeInstance({ currentLevel: 1 }));

      const result = await service.decide("inst-1", "approver-b", "APPROVE");
      expect(result.status).toBe("APPROVED");
    });

    it("authorizes a DEPT_HEAD-type level via the matched routing rule's department head", async () => {
      levelRepository.listByVersion.mockResolvedValue([makeLevel({ seq: 1, approverType: "DEPT_HEAD" })]);
      routingRuleRepository.listByVersion.mockResolvedValue([
        makeRule({ minAmount: Money.fromInt(0), maxAmount: null, departmentId: "dept-1", levelSubset: null }),
      ]);
      // The rule is department-scoped, so it only matches when the initiator's own department equals it.
      usersService.findByIdOrFail.mockResolvedValue({ id: "initiator-1", departmentId: "dept-1" });
      departmentsService.findByIdOrFail.mockResolvedValue({ id: "dept-1", headUserId: "head-1" });
      instanceRepository.findByIdOrFail.mockResolvedValue(makeInstance({ currentLevel: 1 }));

      const result = await service.decide("inst-1", "head-1", "APPROVE");
      expect(result.status).toBe("APPROVED");
    });

    it("rejects an actor who is not a legitimate approver or a delegate of one", async () => {
      levelRepository.listByVersion.mockResolvedValue([
        makeLevel({ seq: 1, approverType: "USERS", userIds: ["approver-a"] }),
      ]);
      instanceRepository.findByIdOrFail.mockResolvedValue(makeInstance({ currentLevel: 1 }));
      delegationsService.resolveEffectiveApprover.mockResolvedValue("approver-a"); // no active delegation to the stranger

      await expect(service.decide("inst-1", "stranger", "APPROVE")).rejects.toBeInstanceOf(AuthorizationException);
    });

    it("rejects direct self-approval (actor === initiator)", async () => {
      instanceRepository.findByIdOrFail.mockResolvedValue(makeInstance({ currentLevel: 1, initiatorId: "initiator-1" }));

      await expect(service.decide("inst-1", "initiator-1", "APPROVE")).rejects.toBeInstanceOf(AuthorizationException);
      expect(actionRepository.create).not.toHaveBeenCalled();
    });

    it("rejects self-approval exercised via delegation (initiator delegated to actor)", async () => {
      levelRepository.listByVersion.mockResolvedValue([
        makeLevel({ seq: 1, approverType: "USERS", userIds: ["initiator-1"] }),
      ]);
      instanceRepository.findByIdOrFail.mockResolvedValue(makeInstance({ currentLevel: 1, initiatorId: "initiator-1" }));
      // initiator-1 (a legitimate approver) delegated to "delegate-1"
      delegationsService.resolveEffectiveApprover.mockImplementation(async (userId: string) =>
        userId === "initiator-1" ? "delegate-1" : userId,
      );

      await expect(service.decide("inst-1", "delegate-1", "APPROVE")).rejects.toBeInstanceOf(AuthorizationException);
    });

    it("records was_delegated_from when the actor acts as a legitimate approver's resolved delegate", async () => {
      levelRepository.listByVersion.mockResolvedValue([
        makeLevel({ seq: 1, approverType: "USERS", userIds: ["approver-a"] }),
      ]);
      instanceRepository.findByIdOrFail.mockResolvedValue(makeInstance({ currentLevel: 1 }));
      delegationsService.resolveEffectiveApprover.mockImplementation(async (userId: string) =>
        userId === "approver-a" ? "delegate-1" : userId,
      );

      await service.decide("inst-1", "delegate-1", "APPROVE");

      expect(actionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: "delegate-1", wasDelegatedFrom: "approver-a" }),
        expect.anything(),
      );
    });
  });

  describe("decide — SEQUENTIAL vs PARALLEL advancement", () => {
    it("advances a SEQUENTIAL level on a single APPROVE", async () => {
      levelRepository.listByVersion.mockResolvedValue([
        makeLevel({ seq: 1, approverType: "USERS", userIds: ["a1"], mode: "SEQUENTIAL" }),
        makeLevel({ seq: 2, approverType: "USERS", userIds: ["a2"], mode: "SEQUENTIAL" }),
      ]);
      instanceRepository.findByIdOrFail.mockResolvedValue(makeInstance({ currentLevel: 1 }));

      const result = await service.decide("inst-1", "a1", "APPROVE");

      expect(result.status).toBe("PENDING");
      expect(result.currentLevel).toBe(2);
    });

    it("keeps a PARALLEL level PENDING at the same level while under quorum", async () => {
      levelRepository.listByVersion.mockResolvedValue([
        makeLevel({ seq: 1, approverType: "USERS", userIds: ["a1", "a2", "a3"], mode: "PARALLEL", quorum: 2 }),
      ]);
      instanceRepository.findByIdOrFail.mockResolvedValue(makeInstance({ currentLevel: 1 }));
      actionRepository.countApprovalsAtLevel.mockResolvedValue(1); // only this one recorded so far

      const result = await service.decide("inst-1", "a1", "APPROVE");

      expect(result.status).toBe("PENDING");
      expect(result.currentLevel).toBe(1);
    });

    it("advances (and resolves, since it's the last level) a PARALLEL level once quorum is met", async () => {
      levelRepository.listByVersion.mockResolvedValue([
        makeLevel({ seq: 1, approverType: "USERS", userIds: ["a1", "a2", "a3"], mode: "PARALLEL", quorum: 2 }),
      ]);
      instanceRepository.findByIdOrFail.mockResolvedValue(makeInstance({ currentLevel: 1 }));
      actionRepository.countApprovalsAtLevel.mockResolvedValue(2); // quorum met including this action

      const result = await service.decide("inst-1", "a2", "APPROVE");

      expect(result.status).toBe("APPROVED");
    });
  });

  describe("decide — REJECT/RETURN", () => {
    it("REJECT requires a comment", async () => {
      await expect(service.decide("inst-1", "approver-1", "REJECT")).rejects.toBeInstanceOf(ValidationException);
    });

    it("REJECT with a comment sets status=REJECTED and decided_at", async () => {
      levelRepository.listByVersion.mockResolvedValue([
        makeLevel({ seq: 1, approverType: "USERS", userIds: ["approver-1"] }),
      ]);
      instanceRepository.findByIdOrFail.mockResolvedValue(makeInstance({ currentLevel: 1 }));

      const result = await service.decide("inst-1", "approver-1", "REJECT", "not eligible");

      expect(result.status).toBe("REJECTED");
      expect(result.decidedAt).not.toBeNull();
    });

    it("RETURN with a comment sets status=RETURNED", async () => {
      levelRepository.listByVersion.mockResolvedValue([
        makeLevel({ seq: 1, approverType: "USERS", userIds: ["approver-1"] }),
      ]);
      instanceRepository.findByIdOrFail.mockResolvedValue(makeInstance({ currentLevel: 1 }));

      const result = await service.decide("inst-1", "approver-1", "RETURN", "needs more info");

      expect(result.status).toBe("RETURNED");
    });

    it("rejects deciding on a non-PENDING instance", async () => {
      instanceRepository.findByIdOrFail.mockResolvedValue(makeInstance({ status: "APPROVED" }));
      await expect(service.decide("inst-1", "approver-1", "APPROVE")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("cancel", () => {
    it("allows the initiator to cancel their own PENDING instance", async () => {
      instanceRepository.findByIdOrFail.mockResolvedValue(makeInstance({ initiatorId: "initiator-1" }));
      const result = await service.cancel("inst-1", "initiator-1");
      expect(result.status).toBe("CANCELLED");
    });

    it("allows a privileged caller to cancel someone else's PENDING instance", async () => {
      instanceRepository.findByIdOrFail.mockResolvedValue(makeInstance({ initiatorId: "initiator-1" }));
      const result = await service.cancel("inst-1", "admin-1", true);
      expect(result.status).toBe("CANCELLED");
    });

    it("rejects a non-initiator, non-privileged caller", async () => {
      instanceRepository.findByIdOrFail.mockResolvedValue(makeInstance({ initiatorId: "initiator-1" }));
      await expect(service.cancel("inst-1", "stranger", false)).rejects.toBeInstanceOf(AuthorizationException);
    });

    it("rejects cancelling a non-PENDING instance", async () => {
      instanceRepository.findByIdOrFail.mockResolvedValue(makeInstance({ status: "APPROVED" }));
      await expect(service.cancel("inst-1", "initiator-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("listPendingForApprover", () => {
    it("returns instances where the user is a legitimate approver for the current level", async () => {
      const instanceForUser = makeInstance({ id: "inst-a", currentLevel: 1 });
      instanceRepository.listPending.mockResolvedValue([instanceForUser]);
      levelRepository.listByVersion.mockResolvedValue([
        makeLevel({ seq: 1, approverType: "USERS", userIds: ["target-user"] }),
      ]);

      const result = await service.listPendingForApprover("target-user");

      expect(result.map((i) => i.id)).toEqual(["inst-a"]);
    });

    it("never includes an instance the user themselves initiated", async () => {
      const ownInstance = makeInstance({ id: "inst-own", initiatorId: "target-user", currentLevel: 1 });
      instanceRepository.listPending.mockResolvedValue([ownInstance]);
      levelRepository.listByVersion.mockResolvedValue([
        makeLevel({ seq: 1, approverType: "USERS", userIds: ["target-user"] }),
      ]);

      const result = await service.listPendingForApprover("target-user");

      expect(result).toHaveLength(0);
    });

    it("excludes instances the user is not authorized for", async () => {
      const instance = makeInstance({ id: "inst-1", currentLevel: 1 });
      instanceRepository.listPending.mockResolvedValue([instance]);
      levelRepository.listByVersion.mockResolvedValue([
        makeLevel({ seq: 1, approverType: "USERS", userIds: ["someone-else"] }),
      ]);

      const result = await service.listPendingForApprover("target-user");

      expect(result).toHaveLength(0);
    });
  });

  describe("getStatus", () => {
    it("delegates to the repository's latest-by-entity lookup", async () => {
      const instance = makeInstance({});
      instanceRepository.findLatestByEntity.mockResolvedValue(instance);
      const result = await service.getStatus("test_entity", "entity-1");
      expect(result).toBe(instance);
      expect(instanceRepository.findLatestByEntity).toHaveBeenCalledWith("test_entity", "entity-1");
    });

    it("returns null when no instance was ever submitted for the entity", async () => {
      instanceRepository.findLatestByEntity.mockResolvedValue(null);
      const result = await service.getStatus("test_entity", "never-submitted");
      expect(result).toBeNull();
    });
  });
});

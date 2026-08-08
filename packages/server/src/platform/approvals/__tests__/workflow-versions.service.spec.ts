import { DataSource, EntityManager } from "typeorm";
import { WorkflowVersionsService } from "../application/workflow-versions.service";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { ApprWorkflowVersionEntity } from "../domain/appr-workflow-version.entity";

describe("WorkflowVersionsService", () => {
  let dataSource: DataSource;
  let workflowDefRepository: { findByIdOrFail: jest.Mock };
  let workflowVersionRepository: { listByDef: jest.Mock; create: jest.Mock; save: jest.Mock; findByIdOrFail: jest.Mock; findCurrent: jest.Mock };
  let levelRepository: { create: jest.Mock };
  let routingRuleRepository: { create: jest.Mock };
  let service: WorkflowVersionsService;

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;

    workflowDefRepository = { findByIdOrFail: jest.fn(async () => ({ id: "def-1" })) };
    workflowVersionRepository = {
      listByDef: jest.fn(async () => []),
      create: jest.fn(
        async (data: Partial<ApprWorkflowVersionEntity>) => ({ id: "ver-new", ...data }) as ApprWorkflowVersionEntity,
      ),
      save: jest.fn(async (e: ApprWorkflowVersionEntity) => e),
      findByIdOrFail: jest.fn(),
      findCurrent: jest.fn(),
    };
    levelRepository = { create: jest.fn(async () => undefined) };
    routingRuleRepository = { create: jest.fn(async () => undefined) };

    service = new WorkflowVersionsService(
      dataSource,
      workflowDefRepository as never,
      workflowVersionRepository as never,
      levelRepository as never,
      routingRuleRepository as never,
    );
  });

  describe("publishNewVersion", () => {
    it("requires at least one level", async () => {
      await expect(service.publishNewVersion("def-1", [], [], "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects duplicate seq values across levels", async () => {
      await expect(
        service.publishNewVersion(
          "def-1",
          [
            { seq: 1, approverType: "USERS", userIds: ["u1"], mode: "SEQUENTIAL" },
            { seq: 1, approverType: "USERS", userIds: ["u2"], mode: "SEQUENTIAL" },
          ],
          [],
          "actor-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("creates version 1 when no prior versions exist, and marks it current", async () => {
      const created = await service.publishNewVersion(
        "def-1",
        [{ seq: 1, approverType: "USERS", userIds: ["u1"], mode: "SEQUENTIAL" }],
        [],
        "actor-1",
      );
      expect(created.version).toBe(1);
      expect(created.isCurrent).toBe(true);
      expect(levelRepository.create).toHaveBeenCalledTimes(1);
    });

    it("increments to the next version number and demotes the previous current version", async () => {
      const previousCurrent = { id: "ver-old", workflowDefId: "def-1", version: 1, isCurrent: true } as ApprWorkflowVersionEntity;
      workflowVersionRepository.listByDef.mockResolvedValue([previousCurrent]);

      const created = await service.publishNewVersion(
        "def-1",
        [{ seq: 1, approverType: "USERS", userIds: ["u1"], mode: "SEQUENTIAL" }],
        [{ minAmount: Money.fromInt(0), maxAmount: null }],
        "actor-1",
      );

      expect(created.version).toBe(2);
      expect(workflowVersionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "ver-old", isCurrent: false }),
        expect.anything(),
      );
      expect(routingRuleRepository.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("setCurrent", () => {
    it("unsets the previous current version before setting the new one", async () => {
      const target = { id: "ver-2", workflowDefId: "def-1", version: 2, isCurrent: false } as ApprWorkflowVersionEntity;
      const previous = { id: "ver-1", workflowDefId: "def-1", version: 1, isCurrent: true } as ApprWorkflowVersionEntity;
      workflowVersionRepository.findByIdOrFail.mockResolvedValue(target);
      workflowVersionRepository.findCurrent.mockResolvedValue(previous);

      const result = await service.setCurrent("ver-2", "actor-1");

      expect(result.isCurrent).toBe(true);
      expect(workflowVersionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "ver-1", isCurrent: false }),
        expect.anything(),
      );
    });

    it("is a no-op-ish save when the target is already current (no previous distinct row)", async () => {
      const target = { id: "ver-1", workflowDefId: "def-1", version: 1, isCurrent: true } as ApprWorkflowVersionEntity;
      workflowVersionRepository.findByIdOrFail.mockResolvedValue(target);
      workflowVersionRepository.findCurrent.mockResolvedValue(target);

      const result = await service.setCurrent("ver-1", "actor-1");

      expect(result.isCurrent).toBe(true);
      // save called only once, for the target itself (no separate "unset previous" save since previous === target)
      expect(workflowVersionRepository.save).toHaveBeenCalledTimes(1);
    });
  });
});

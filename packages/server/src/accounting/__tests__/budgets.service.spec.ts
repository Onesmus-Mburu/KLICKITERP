import { DataSource, EntityManager } from "typeorm";
import { BudgetsService, GL_BUDGET_APPROVAL_DOMAIN_CODE } from "../application/budgets.service";
import { ValidationException } from "../../shared/exceptions/validation.exception";
import { Money } from "../../shared/money/money";
import { GlAccountEntity } from "../domain/gl-account.entity";
import { GlBudgetEntity } from "../domain/gl-budget.entity";
import { GlBudgetLineEntity } from "../domain/gl-budget-line.entity";
import { GlFiscalYearEntity } from "../domain/gl-fiscal-year.entity";

function makeBudget(overrides: Partial<GlBudgetEntity>): GlBudgetEntity {
  return {
    id: "budget-1",
    fiscalYearId: "fy-1",
    name: "FY2026 Budget",
    versionLabel: "v1",
    status: "DRAFT",
    approvalRef: null,
    ...overrides,
  } as GlBudgetEntity;
}

function makeBudgetLine(overrides: Partial<GlBudgetLineEntity>): GlBudgetLineEntity {
  return {
    id: "line-1",
    budgetId: "budget-1",
    accountId: "acc-1",
    costCenterId: null,
    periodPhasing: {},
    annualAmount: Money.fromInt(1200),
    ...overrides,
  } as GlBudgetLineEntity;
}

describe("BudgetsService", () => {
  let budgetRepository: {
    findByIdOrFail: jest.Mock;
    listByFiscalYear: jest.Mock;
    findActiveForFiscalYear: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let budgetLineRepository: {
    listByBudget: jest.Mock;
    findByIdOrFail: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let fiscalYearRepository: { findByIdOrFail: jest.Mock };
  let accountRepository: { findByIdOrFail: jest.Mock };
  let dataSource: DataSource;
  let approvalEngine: { submit: jest.Mock };
  let outboxWriter: { write: jest.Mock };
  let service: BudgetsService;

  beforeEach(() => {
    budgetRepository = {
      findByIdOrFail: jest.fn(),
      listByFiscalYear: jest.fn(),
      findActiveForFiscalYear: jest.fn(async () => null),
      create: jest.fn(async (data) => makeBudget(data)),
      save: jest.fn(async (e) => e),
    };
    budgetLineRepository = {
      listByBudget: jest.fn(async () => []),
      findByIdOrFail: jest.fn(),
      create: jest.fn(async (data) => makeBudgetLine(data)),
      save: jest.fn(async (e) => e),
      delete: jest.fn(async () => undefined),
    };
    fiscalYearRepository = { findByIdOrFail: jest.fn(async () => ({ id: "fy-1" }) as GlFiscalYearEntity) };
    accountRepository = {
      findByIdOrFail: jest.fn(async (id: string) => ({ id, code: "4010", isPostable: true }) as GlAccountEntity),
    };
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;
    approvalEngine = { submit: jest.fn(async () => ({ id: "instance-1" })) };
    outboxWriter = { write: jest.fn(async () => undefined) };

    service = new BudgetsService(
      budgetRepository as never,
      budgetLineRepository as never,
      fiscalYearRepository as never,
      accountRepository as never,
      dataSource,
      approvalEngine as never,
      outboxWriter as never,
    );
  });

  describe("create", () => {
    it("rejects a line whose account is not postable", async () => {
      accountRepository.findByIdOrFail.mockResolvedValue({ id: "acc-1", code: "1000", isPostable: false } as GlAccountEntity);
      await expect(
        service.create(
          {
            fiscalYearId: "fy-1",
            name: "Budget",
            versionLabel: "v1",
            lines: [{ accountId: "acc-1", periodPhasing: {}, annualAmount: Money.fromInt(100) }],
          },
          "actor-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("submitForApproval", () => {
    it("rejects submitting a non-DRAFT budget", async () => {
      budgetRepository.findByIdOrFail.mockResolvedValue(makeBudget({ status: "ACTIVE" }));
      await expect(service.submitForApproval("budget-1", "initiator-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects submitting a budget with no lines", async () => {
      budgetRepository.findByIdOrFail.mockResolvedValue(makeBudget({ status: "DRAFT" }));
      budgetLineRepository.listByBudget.mockResolvedValue([]);
      await expect(service.submitForApproval("budget-1", "initiator-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("sums annual_amount across lines and calls ApprovalEngineService.submit correctly", async () => {
      budgetRepository.findByIdOrFail.mockResolvedValue(makeBudget({ status: "DRAFT" }));
      budgetLineRepository.listByBudget.mockResolvedValue([
        makeBudgetLine({ annualAmount: Money.fromInt(700) }),
        makeBudgetLine({ id: "line-2", annualAmount: Money.fromInt(300) }),
      ]);

      const result = await service.submitForApproval("budget-1", "initiator-1");

      expect(approvalEngine.submit).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          domainCode: GL_BUDGET_APPROVAL_DOMAIN_CODE,
          entityType: "gl_budget",
          entityId: "budget-1",
          amount: Money.fromInt(1000),
          initiatorId: "initiator-1",
        }),
      );
      expect(result.status).toBe("PENDING_APPROVAL");
      expect(result.approvalRef).toBe("instance-1");
    });
  });

  describe("onApprovalDecided", () => {
    it("rejects a budget that is not PENDING_APPROVAL", async () => {
      budgetRepository.findByIdOrFail.mockResolvedValue(makeBudget({ status: "DRAFT" }));
      await expect(service.onApprovalDecided("budget-1", true, "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejection (approved=false) transitions PENDING_APPROVAL -> DRAFT", async () => {
      budgetRepository.findByIdOrFail.mockResolvedValue(makeBudget({ status: "PENDING_APPROVAL" }));
      const result = await service.onApprovalDecided("budget-1", false, "actor-1");
      expect(result.status).toBe("DRAFT");
      expect(outboxWriter.write).not.toHaveBeenCalled();
    });

    it("activation supersedes the previous ACTIVE budget for the same fiscal year", async () => {
      const target = makeBudget({ id: "budget-2", status: "PENDING_APPROVAL", fiscalYearId: "fy-1" });
      const previousActive = makeBudget({ id: "budget-1", status: "ACTIVE", fiscalYearId: "fy-1" });
      budgetRepository.findByIdOrFail.mockResolvedValue(target);
      budgetRepository.findActiveForFiscalYear.mockResolvedValue(previousActive);

      const result = await service.onApprovalDecided("budget-2", true, "actor-1");

      expect(result.status).toBe("ACTIVE");
      expect(budgetRepository.save).toHaveBeenCalledWith(expect.objectContaining({ id: "budget-1", status: "SUPERSEDED" }), {});
      expect(outboxWriter.write).toHaveBeenCalled();
    });

    it("activation with no previous ACTIVE budget just activates (no supersede save)", async () => {
      const target = makeBudget({ id: "budget-2", status: "PENDING_APPROVAL", fiscalYearId: "fy-1" });
      budgetRepository.findByIdOrFail.mockResolvedValue(target);
      budgetRepository.findActiveForFiscalYear.mockResolvedValue(null);

      const result = await service.onApprovalDecided("budget-2", true, "actor-1");

      expect(result.status).toBe("ACTIVE");
      expect(budgetRepository.save).toHaveBeenCalledTimes(1);
    });
  });

  describe("line editing — DRAFT-only", () => {
    it("addLine rejects once the budget is no longer DRAFT", async () => {
      budgetRepository.findByIdOrFail.mockResolvedValue(makeBudget({ status: "ACTIVE" }));
      await expect(
        service.addLine("budget-1", { accountId: "acc-1", periodPhasing: {}, annualAmount: Money.fromInt(1) }, "actor-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("removeLine rejects once the budget is no longer DRAFT", async () => {
      budgetLineRepository.findByIdOrFail.mockResolvedValue(makeBudgetLine({ budgetId: "budget-1" }));
      budgetRepository.findByIdOrFail.mockResolvedValue(makeBudget({ status: "PENDING_APPROVAL" }));
      await expect(service.removeLine("line-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });
});

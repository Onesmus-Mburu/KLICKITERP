import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { GlAccountEntity } from "../../../accounting";
import { ClaimsService, EXPENSE_CLAIMS_APPROVAL_DOMAIN_CODE, STAFF_REIMBURSEMENTS_PAYABLE_ACCOUNT_CODE } from "../application/claims.service";
import { ExpCategoryEntity } from "../domain/exp-category.entity";
import { ExpClaimEntity } from "../domain/exp-claim.entity";
import { ExpClaimLineEntity } from "../domain/exp-claim-line.entity";

function makeClaim(overrides: Partial<ExpClaimEntity> = {}): ExpClaimEntity {
  return {
    id: "claim-1",
    number: "DRAFT-claim-1",
    staffUserId: "staff-1",
    total: Money.fromInt(300),
    status: "APPROVED",
    reimburseVia: "DIRECT",
    approvalRef: null,
    ...overrides,
  } as ExpClaimEntity;
}

function makeLine(overrides: Partial<ExpClaimLineEntity> = {}): ExpClaimLineEntity {
  return {
    id: "line-1",
    claimId: "claim-1",
    lineNo: 1,
    categoryId: "cat-1",
    description: "Taxi",
    amount: Money.fromInt(300),
    expenseDate: "2026-01-01",
    receiptFileId: null,
    ...overrides,
  } as ExpClaimLineEntity;
}

function makeCategory(overrides: Partial<ExpCategoryEntity> = {}): ExpCategoryEntity {
  return { id: "cat-1", name: "Transport", parentId: null, glExpenseAccountId: "exp-acc-1", budgetRequired: false, isActive: true, ...overrides } as ExpCategoryEntity;
}

function makeAccount(overrides: Partial<GlAccountEntity> = {}): GlAccountEntity {
  return { id: "acc-1", code: "9999", isActive: true, isPostable: true, ...overrides } as GlAccountEntity;
}

describe("ClaimsService", () => {
  let claimRepository: { findByIdOrFail: jest.Mock; create: jest.Mock; save: jest.Mock; listByStaffUserId: jest.Mock; listAll: jest.Mock };
  let lineRepository: { findByIdOrFail: jest.Mock; listByClaimId: jest.Mock; create: jest.Mock; save: jest.Mock; delete: jest.Mock };
  let categoryRepository: { findByIdOrFail: jest.Mock };
  let glAccountRepository: { findByCode: jest.Mock; findByCodeOrFail: jest.Mock; findByControlDomain: jest.Mock };
  let postingService: { post: jest.Mock };
  let numberingService: { allocate: jest.Mock };
  let approvalEngine: { submit: jest.Mock };
  let service: ClaimsService;

  const em = {} as EntityManager;

  beforeEach(() => {
    claimRepository = {
      findByIdOrFail: jest.fn(async () => makeClaim()),
      create: jest.fn(async (data) => makeClaim(data)),
      save: jest.fn(async (e) => e),
      listByStaffUserId: jest.fn(async () => []),
      listAll: jest.fn(async () => []),
    };
    lineRepository = {
      findByIdOrFail: jest.fn(async () => makeLine()),
      listByClaimId: jest.fn(async () => [makeLine()]),
      create: jest.fn(async (data) => makeLine(data)),
      save: jest.fn(async (e) => e),
      delete: jest.fn(async () => undefined),
    };
    categoryRepository = { findByIdOrFail: jest.fn(async () => makeCategory()) };
    glAccountRepository = {
      findByCode: jest.fn(async (code: string) => {
        if (code === "1010") return makeAccount({ id: "cash-acc", code });
        if (code === "1020") return makeAccount({ id: "bank-acc", code });
        return null;
      }),
      findByCodeOrFail: jest.fn(async (code: string) => makeAccount({ id: "payable-acc", code })),
      findByControlDomain: jest.fn(async () => [makeAccount({ id: "mpesa-acc", code: "1400" })]),
    };
    postingService = { post: jest.fn(async () => ({ id: "journal-1", lines: [] })) };
    numberingService = { allocate: jest.fn(async () => "EXPCLM-000001") };
    approvalEngine = { submit: jest.fn(async () => ({ id: "approval-1" })) };

    service = new ClaimsService(
      claimRepository as never,
      lineRepository as never,
      categoryRepository as never,
      glAccountRepository as never,
      postingService as never,
      numberingService as never,
      approvalEngine as never,
    );
  });

  describe("submit()", () => {
    it("submits under EXPENSE_CLAIMS and moves to PENDING_APPROVAL", async () => {
      claimRepository.findByIdOrFail.mockResolvedValue(makeClaim({ status: "DRAFT" }));
      const result = await service.submit(em, "claim-1", "actor-1");
      expect(approvalEngine.submit).toHaveBeenCalledWith(
        em,
        expect.objectContaining({ domainCode: EXPENSE_CLAIMS_APPROVAL_DOMAIN_CODE, entityType: "exp_claim" }),
      );
      expect(result.status).toBe("PENDING_APPROVAL");
    });

    it("rejects a claim with no lines", async () => {
      claimRepository.findByIdOrFail.mockResolvedValue(makeClaim({ status: "DRAFT" }));
      lineRepository.listByClaimId.mockResolvedValue([]);
      await expect(service.submit(em, "claim-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("onApprovalDecided()", () => {
    it("approved -> APPROVED", async () => {
      claimRepository.findByIdOrFail.mockResolvedValue(makeClaim({ status: "PENDING_APPROVAL" }));
      const result = await service.onApprovalDecided(em, "claim-1", true);
      expect(result.status).toBe("APPROVED");
    });

    it("rejected -> REJECTED (exp_claim DOES have a dedicated REJECTED status)", async () => {
      claimRepository.findByIdOrFail.mockResolvedValue(makeClaim({ status: "PENDING_APPROVAL" }));
      const result = await service.onApprovalDecided(em, "claim-1", false);
      expect(result.status).toBe("REJECTED");
    });
  });

  describe("reimburse() — DIRECT vs PAYROLL branching", () => {
    it("rejects a non-APPROVED claim", async () => {
      claimRepository.findByIdOrFail.mockResolvedValue(makeClaim({ status: "DRAFT" }));
      await expect(service.reimburse(em, "claim-1", "actor-1", "CASH")).rejects.toBeInstanceOf(ValidationException);
    });

    it("DIRECT without a method: rejects", async () => {
      claimRepository.findByIdOrFail.mockResolvedValue(makeClaim({ status: "APPROVED", reimburseVia: "DIRECT" }));
      await expect(service.reimburse(em, "claim-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("DIRECT: debits each line's category expense account, credits the method-resolved clearing account", async () => {
      claimRepository.findByIdOrFail.mockResolvedValue(makeClaim({ status: "APPROVED", reimburseVia: "DIRECT", total: Money.fromInt(300) }));
      lineRepository.listByClaimId.mockResolvedValue([makeLine({ amount: Money.fromInt(300), categoryId: "cat-1" })]);
      categoryRepository.findByIdOrFail.mockResolvedValue(makeCategory({ glExpenseAccountId: "exp-acc-1" }));

      const result = await service.reimburse(em, "claim-1", "actor-1", "CASH");

      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: "exp-acc-1", debit: Money.fromInt(300), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "cash-acc", debit: Money.ZERO, credit: Money.fromInt(300) }),
          ],
        }),
      );
      expect(result.status).toBe("REIMBURSED");
      expect(numberingService.allocate).toHaveBeenCalledWith(em, "EXP_CLAIM");
    });

    it("PAYROLL: debits each line's category expense account, credits Staff Reimbursements Payable (2040) — an accrual, not real cash", async () => {
      claimRepository.findByIdOrFail.mockResolvedValue(makeClaim({ status: "APPROVED", reimburseVia: "PAYROLL", total: Money.fromInt(300) }));
      lineRepository.listByClaimId.mockResolvedValue([makeLine({ amount: Money.fromInt(300), categoryId: "cat-1" })]);
      categoryRepository.findByIdOrFail.mockResolvedValue(makeCategory({ glExpenseAccountId: "exp-acc-1" }));

      const result = await service.reimburse(em, "claim-1", "actor-1");

      expect(glAccountRepository.findByCodeOrFail).toHaveBeenCalledWith(STAFF_REIMBURSEMENTS_PAYABLE_ACCOUNT_CODE, em);
      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: "exp-acc-1", debit: Money.fromInt(300), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "payable-acc", debit: Money.ZERO, credit: Money.fromInt(300) }),
          ],
        }),
      );
      expect(result.status).toBe("REIMBURSED");
    });

    it("aggregates multiple lines against the same category into one debit line", async () => {
      claimRepository.findByIdOrFail.mockResolvedValue(makeClaim({ status: "APPROVED", reimburseVia: "DIRECT", total: Money.fromInt(500) }));
      lineRepository.listByClaimId.mockResolvedValue([
        makeLine({ id: "l1", amount: Money.fromInt(300), categoryId: "cat-1" }),
        makeLine({ id: "l2", amount: Money.fromInt(200), categoryId: "cat-1" }),
      ]);
      categoryRepository.findByIdOrFail.mockResolvedValue(makeCategory({ glExpenseAccountId: "exp-acc-1" }));

      await service.reimburse(em, "claim-1", "actor-1", "BANK");

      const call = postingService.post.mock.calls[0][1];
      const debitLines = call.lines.filter((l: { debit: Money }) => l.debit.isPositive());
      expect(debitLines).toHaveLength(1);
      expect(debitLines[0].accountId).toBe("exp-acc-1");
      expect(debitLines[0].debit).toEqual(Money.fromInt(500));
    });
  });
});

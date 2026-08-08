import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { GlAccountEntity } from "../../../accounting";
import { EXPENSES_APPROVAL_DOMAIN_CODE, EXPENSE_ATTACHMENT_THRESHOLD_SETTING_KEY, VouchersService } from "../application/vouchers.service";
import { ExpCategoryEntity } from "../domain/exp-category.entity";
import { ExpVoucherEntity } from "../domain/exp-voucher.entity";

function makeVoucher(overrides: Partial<ExpVoucherEntity> = {}): ExpVoucherEntity {
  return {
    id: "voucher-1",
    number: "DRAFT-voucher-1",
    payeeType: "OTHER",
    payeeRef: { name: "Acme" },
    categoryId: "cat-1",
    costCenterId: null,
    amount: Money.fromInt(500),
    method: "CASH",
    narrative: "Office supplies",
    status: "DRAFT",
    approvalRef: null,
    journalId: null,
    ...overrides,
  } as ExpVoucherEntity;
}

function makeCategory(overrides: Partial<ExpCategoryEntity> = {}): ExpCategoryEntity {
  return {
    id: "cat-1",
    name: "Office Supplies",
    parentId: null,
    glExpenseAccountId: "exp-acc-1",
    budgetRequired: false,
    isActive: true,
    ...overrides,
  } as ExpCategoryEntity;
}

function makeAccount(overrides: Partial<GlAccountEntity> = {}): GlAccountEntity {
  return { id: "acc-1", code: "9999", isActive: true, isPostable: true, ...overrides } as GlAccountEntity;
}

describe("VouchersService", () => {
  let voucherRepository: { findByIdOrFail: jest.Mock; create: jest.Mock; save: jest.Mock; listByStatus: jest.Mock; listAll: jest.Mock };
  let categoryRepository: { findByIdOrFail: jest.Mock };
  let postingService: { post: jest.Mock };
  let numberingService: { allocate: jest.Mock };
  let approvalEngine: { submit: jest.Mock };
  let settingsService: { getTyped: jest.Mock };
  let filesService: { listByEntity: jest.Mock };
  let glAccountRepository: { findByCode: jest.Mock; findByControlDomain: jest.Mock };
  let budgetRepository: { findActiveForFiscalYear: jest.Mock };
  let budgetLineRepository: { findByBudgetAccountCostCenter: jest.Mock };
  let periodRepository: { findCurrentForDate: jest.Mock; listByFiscalYear: jest.Mock };
  let periodAccountTotalRepository: { listByAccount: jest.Mock };
  let service: VouchersService;

  const em = {} as EntityManager;

  beforeEach(() => {
    voucherRepository = {
      findByIdOrFail: jest.fn(async () => makeVoucher()),
      create: jest.fn(async (data) => makeVoucher(data)),
      save: jest.fn(async (e) => e),
      listByStatus: jest.fn(async () => []),
      listAll: jest.fn(async () => []),
    };
    categoryRepository = { findByIdOrFail: jest.fn(async () => makeCategory()) };
    postingService = { post: jest.fn(async () => ({ id: "journal-1", lines: [] })) };
    numberingService = { allocate: jest.fn(async () => "EXP-000001") };
    approvalEngine = { submit: jest.fn(async () => ({ id: "approval-1" })) };
    settingsService = { getTyped: jest.fn(async () => null) };
    filesService = { listByEntity: jest.fn(async () => []) };
    glAccountRepository = {
      findByCode: jest.fn(async (code: string) => {
        if (code === "1010") return makeAccount({ id: "cash-acc", code });
        if (code === "1020") return makeAccount({ id: "bank-acc", code });
        if (code === "1030") return makeAccount({ id: "cheque-acc", code });
        if (code === "1015") return makeAccount({ id: "petty-cash-float-acc", code });
        return null;
      }),
      findByControlDomain: jest.fn(async () => [makeAccount({ id: "mpesa-acc", code: "1400" })]),
    };
    budgetRepository = { findActiveForFiscalYear: jest.fn(async () => null) };
    budgetLineRepository = { findByBudgetAccountCostCenter: jest.fn(async () => null) };
    periodRepository = { findCurrentForDate: jest.fn(async () => ({ id: "period-1", fiscalYearId: "fy-1" })), listByFiscalYear: jest.fn(async () => []) };
    periodAccountTotalRepository = { listByAccount: jest.fn(async () => []) };

    service = new VouchersService(
      voucherRepository as never,
      categoryRepository as never,
      postingService as never,
      numberingService as never,
      approvalEngine as never,
      settingsService as never,
      filesService as never,
      glAccountRepository as never,
      budgetRepository as never,
      budgetLineRepository as never,
      periodRepository as never,
      periodAccountTotalRepository as never,
    );
  });

  describe("submit() — BR-EXP-03 attachment threshold", () => {
    it("below threshold: no attachment required, submission succeeds", async () => {
      settingsService.getTyped.mockResolvedValue(null); // default threshold 1000
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ amount: Money.fromInt(500), status: "DRAFT" }));
      const result = await service.submit(em, "voucher-1", "actor-1");
      expect(filesService.listByEntity).not.toHaveBeenCalled();
      expect(result.status).toBe("PENDING_APPROVAL");
    });

    it("above threshold with zero attachments: rejects with ValidationException", async () => {
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ amount: Money.fromInt(1500), status: "DRAFT" }));
      filesService.listByEntity.mockResolvedValue([]);
      await expect(service.submit(em, "voucher-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("above threshold with at least one attachment: submission succeeds", async () => {
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ amount: Money.fromInt(1500), status: "DRAFT" }));
      filesService.listByEntity.mockResolvedValue([{ id: "file-1" }]);
      const result = await service.submit(em, "voucher-1", "actor-1");
      expect(result.status).toBe("PENDING_APPROVAL");
      expect(approvalEngine.submit).toHaveBeenCalledWith(
        em,
        expect.objectContaining({ domainCode: EXPENSES_APPROVAL_DOMAIN_CODE, entityType: "exp_voucher", entityId: "voucher-1" }),
      );
    });

    it("respects a Settings-configured custom threshold", async () => {
      settingsService.getTyped.mockResolvedValue("100");
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ amount: Money.fromInt(200), status: "DRAFT" }));
      filesService.listByEntity.mockResolvedValue([]);
      await expect(service.submit(em, "voucher-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
      expect(settingsService.getTyped).toHaveBeenCalledWith(EXPENSE_ATTACHMENT_THRESHOLD_SETTING_KEY, null);
    });

    it("rejects a non-DRAFT voucher", async () => {
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "APPROVED" }));
      await expect(service.submit(em, "voucher-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("onApprovalDecided()", () => {
    it("rejects a non-PENDING_APPROVAL voucher", async () => {
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "DRAFT" }));
      await expect(service.onApprovalDecided(em, "voucher-1", true)).rejects.toBeInstanceOf(ValidationException);
    });

    it("approved -> APPROVED", async () => {
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "PENDING_APPROVAL" }));
      const result = await service.onApprovalDecided(em, "voucher-1", true, "actor-1");
      expect(result.status).toBe("APPROVED");
    });

    it("rejected -> CANCELLED (exp_voucher has no dedicated REJECTED status)", async () => {
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "PENDING_APPROVAL" }));
      const result = await service.onApprovalDecided(em, "voucher-1", false, "actor-1");
      expect(result.status).toBe("CANCELLED");
    });
  });

  describe("pay() — P-25 exact debit/credit assertions per method", () => {
    beforeEach(() => {
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "APPROVED", amount: Money.fromInt(500) }));
    });

    it("rejects a non-APPROVED voucher", async () => {
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "DRAFT" }));
      await expect(service.pay(em, "voucher-1", "payer-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("CASH: debits the category's expense account, credits the 1010 cash clearing account", async () => {
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "APPROVED", amount: Money.fromInt(500), method: "CASH" }));
      await service.pay(em, "voucher-1", "payer-1");
      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: "exp-acc-1", debit: Money.fromInt(500), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "cash-acc", debit: Money.ZERO, credit: Money.fromInt(500) }),
          ],
        }),
      );
    });

    it("BANK: credits the 1020 bank clearing account", async () => {
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "APPROVED", amount: Money.fromInt(500), method: "BANK" }));
      await service.pay(em, "voucher-1", "payer-1");
      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({ lines: expect.arrayContaining([expect.objectContaining({ accountId: "bank-acc", credit: Money.fromInt(500) })]) }),
      );
    });

    it("CHEQUE: credits the 1030 cheque clearing account", async () => {
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "APPROVED", amount: Money.fromInt(500), method: "CHEQUE" }));
      await service.pay(em, "voucher-1", "payer-1");
      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({ lines: expect.arrayContaining([expect.objectContaining({ accountId: "cheque-acc", credit: Money.fromInt(500) })]) }),
      );
    });

    it("MPESA: credits the MPESA_CLEARING control account", async () => {
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "APPROVED", amount: Money.fromInt(500), method: "MPESA" }));
      await service.pay(em, "voucher-1", "payer-1");
      expect(glAccountRepository.findByControlDomain).toHaveBeenCalledWith("MPESA_CLEARING", em);
      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({ lines: expect.arrayContaining([expect.objectContaining({ accountId: "mpesa-acc", credit: Money.fromInt(500) })]) }),
      );
    });

    it("PETTY_CASH: credits the 1015 Petty Cash Float account", async () => {
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "APPROVED", amount: Money.fromInt(500), method: "PETTY_CASH" }));
      await service.pay(em, "voucher-1", "payer-1");
      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({
          lines: expect.arrayContaining([expect.objectContaining({ accountId: "petty-cash-float-acc", credit: Money.fromInt(500) })]),
        }),
      );
    });

    it("allocates the real EXP_VOUCHER number, sets status=PAID, and stamps journal_id", async () => {
      const result = await service.pay(em, "voucher-1", "payer-1");
      expect(numberingService.allocate).toHaveBeenCalledWith(em, "EXP_VOUCHER");
      expect(result.number).toBe("EXP-000001");
      expect(result.status).toBe("PAID");
      expect(result.journalId).toBe("journal-1");
    });
  });
});

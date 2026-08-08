import { EntityManager } from "typeorm";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { GlAccountEntity } from "../../../accounting";
import { PettyCashService, PETTY_CASH_REPLENISHMENT_APPROVAL_DOMAIN_CODE } from "../application/petty-cash.service";
import { ExpCategoryEntity } from "../domain/exp-category.entity";
import { ExpPettyCashFloatEntity } from "../domain/exp-petty-cash-float.entity";
import { ExpPettyCashVoucherEntity } from "../domain/exp-petty-cash-voucher.entity";
import { ExpReplenishmentEntity } from "../domain/exp-replenishment.entity";

function makeFloat(overrides: Partial<ExpPettyCashFloatEntity> = {}): ExpPettyCashFloatEntity {
  return {
    id: "float-1",
    custodianUserId: "user-1",
    ceiling: Money.fromInt(5000),
    balance: Money.fromInt(3000),
    ...overrides,
  } as ExpPettyCashFloatEntity;
}

function makePcVoucher(overrides: Partial<ExpPettyCashVoucherEntity> = {}): ExpPettyCashVoucherEntity {
  return {
    id: "pcv-1",
    number: "PCV-000001",
    floatId: "float-1",
    categoryId: "cat-1",
    amount: Money.fromInt(200),
    receiptFileId: null,
    status: "APPROVED",
    journalId: null,
    ...overrides,
  } as ExpPettyCashVoucherEntity;
}

function makeReplenishment(overrides: Partial<ExpReplenishmentEntity> = {}): ExpReplenishmentEntity {
  return {
    id: "repl-1",
    floatId: "float-1",
    amount: Money.fromInt(400),
    voucherIds: ["pcv-1", "pcv-2"],
    status: "PENDING_APPROVAL",
    approvalRef: null,
    journalId: null,
    ...overrides,
  } as ExpReplenishmentEntity;
}

function makeCategory(overrides: Partial<ExpCategoryEntity> = {}): ExpCategoryEntity {
  return { id: "cat-1", name: "Office Supplies", parentId: null, glExpenseAccountId: "exp-acc-1", budgetRequired: false, isActive: true, ...overrides } as ExpCategoryEntity;
}

function makeAccount(overrides: Partial<GlAccountEntity> = {}): GlAccountEntity {
  return { id: "acc-1", code: "9999", isActive: true, isPostable: true, ...overrides } as GlAccountEntity;
}

describe("PettyCashService", () => {
  let floatRepository: { findByIdOrFail: jest.Mock; findByIdForUpdate: jest.Mock; findByCustodianUserId: jest.Mock; listAll: jest.Mock; create: jest.Mock; save: jest.Mock };
  let voucherRepository: { listByFloatId: jest.Mock; create: jest.Mock };
  let replenishmentRepository: { findByIdOrFail: jest.Mock; listByFloatId: jest.Mock; create: jest.Mock; save: jest.Mock; delete: jest.Mock };
  let categoryRepository: { findByIdOrFail: jest.Mock };
  let glAccountRepository: { findByCodeOrFail: jest.Mock; findByCode: jest.Mock };
  let postingService: { post: jest.Mock };
  let numberingService: { allocate: jest.Mock };
  let approvalEngine: { submit: jest.Mock };
  let service: PettyCashService;

  const em = {} as EntityManager;

  beforeEach(() => {
    floatRepository = {
      findByIdOrFail: jest.fn(async () => makeFloat()),
      findByIdForUpdate: jest.fn(async () => makeFloat()),
      findByCustodianUserId: jest.fn(async () => null),
      listAll: jest.fn(async () => []),
      create: jest.fn(async (data) => makeFloat(data)),
      save: jest.fn(async (e) => e),
    };
    voucherRepository = {
      listByFloatId: jest.fn(async () => []),
      create: jest.fn(async (data) => makePcVoucher(data)),
    };
    replenishmentRepository = {
      findByIdOrFail: jest.fn(async () => makeReplenishment()),
      listByFloatId: jest.fn(async () => []),
      create: jest.fn(async (data) => makeReplenishment(data)),
      save: jest.fn(async (e) => e),
      delete: jest.fn(async () => undefined),
    };
    categoryRepository = { findByIdOrFail: jest.fn(async () => makeCategory()) };
    glAccountRepository = {
      findByCodeOrFail: jest.fn(async (code: string) => makeAccount({ id: "float-acc", code })),
      findByCode: jest.fn(async (code: string) => (code === "1020" ? makeAccount({ id: "bank-acc", code }) : null)),
    };
    postingService = { post: jest.fn(async () => ({ id: "journal-1", lines: [] })) };
    numberingService = { allocate: jest.fn(async () => "PCV-000042") };
    approvalEngine = { submit: jest.fn(async () => ({ id: "approval-1" })) };

    service = new PettyCashService(
      floatRepository as never,
      voucherRepository as never,
      replenishmentRepository as never,
      categoryRepository as never,
      glAccountRepository as never,
      postingService as never,
      numberingService as never,
      approvalEngine as never,
    );
  });

  describe("createFloat()", () => {
    it("starts balance = ceiling (fully funded on creation)", async () => {
      const float = await service.createFloat(em, { custodianUserId: "user-1", ceiling: Money.fromInt(5000) }, "actor-1");
      expect(float.balance).toEqual(Money.fromInt(5000));
    });

    it("rejects a non-positive ceiling", async () => {
      await expect(service.createFloat(em, { custodianUserId: "user-1", ceiling: Money.ZERO }, "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("translates a unique-violation (one float per custodian) into ConflictException", async () => {
      const pgError = Object.assign(new Error("duplicate"), { code: "23505" });
      floatRepository.create.mockRejectedValue(pgError);
      await expect(service.createFloat(em, { custodianUserId: "user-1", ceiling: Money.fromInt(5000) }, "actor-1")).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("spend() — BR-EXP-02 balance-floor rejection", () => {
    it("rejects a spend exceeding the float's current balance", async () => {
      floatRepository.findByIdForUpdate.mockResolvedValue(makeFloat({ balance: Money.fromInt(100) }));
      await expect(
        service.spend(em, { floatId: "float-1", categoryId: "cat-1", amount: Money.fromInt(200) }, "actor-1"),
      ).rejects.toBeInstanceOf(ValidationException);
      expect(floatRepository.save).not.toHaveBeenCalled();
    });

    it("allows a spend exactly equal to the balance and decrements it to zero", async () => {
      floatRepository.findByIdForUpdate.mockResolvedValue(makeFloat({ balance: Money.fromInt(200) }));
      await service.spend(em, { floatId: "float-1", categoryId: "cat-1", amount: Money.fromInt(200) }, "actor-1");
      expect(floatRepository.save).toHaveBeenCalledWith(expect.objectContaining({ balance: Money.ZERO }), em);
    });

    it("decrements balance and creates an APPROVED voucher with no GL posting", async () => {
      floatRepository.findByIdForUpdate.mockResolvedValue(makeFloat({ balance: Money.fromInt(1000) }));
      const voucher = await service.spend(em, { floatId: "float-1", categoryId: "cat-1", amount: Money.fromInt(300) }, "actor-1");
      expect(floatRepository.save).toHaveBeenCalledWith(expect.objectContaining({ balance: Money.fromInt(700) }), em);
      expect(voucher.status).toBe("APPROVED");
      expect(postingService.post).not.toHaveBeenCalled();
      expect(numberingService.allocate).toHaveBeenCalledWith(em, "EXP_PETTY_CASH_VOUCHER");
    });

    it("rejects a non-positive amount", async () => {
      await expect(
        service.spend(em, { floatId: "float-1", categoryId: "cat-1", amount: Money.ZERO }, "actor-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("requestReplenishment() — voucher-collection correctness", () => {
    it("rejects when there are no unclaimed APPROVED vouchers", async () => {
      voucherRepository.listByFloatId.mockResolvedValue([]);
      await expect(service.requestReplenishment(em, "float-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("collects every APPROVED voucher not yet claimed by an existing replenishment, sums their amounts", async () => {
      voucherRepository.listByFloatId.mockResolvedValue([
        makePcVoucher({ id: "pcv-1", amount: Money.fromInt(100) }),
        makePcVoucher({ id: "pcv-2", amount: Money.fromInt(150) }),
        makePcVoucher({ id: "pcv-3", amount: Money.fromInt(50) }),
      ]);
      replenishmentRepository.listByFloatId.mockResolvedValue([makeReplenishment({ voucherIds: ["pcv-1"] })]);

      const replenishment = await service.requestReplenishment(em, "float-1", "actor-1");

      expect(replenishment.voucherIds.sort()).toEqual(["pcv-2", "pcv-3"].sort());
      expect(replenishment.amount).toEqual(Money.fromInt(200));
      expect(approvalEngine.submit).toHaveBeenCalledWith(
        em,
        expect.objectContaining({ domainCode: PETTY_CASH_REPLENISHMENT_APPROVAL_DOMAIN_CODE, entityType: "exp_replenishment", amount: Money.fromInt(200) }),
      );
      expect(replenishment.approvalRef).toBe("approval-1");
      expect(replenishment.status).toBe("PENDING_APPROVAL");
    });

    it("claims from ANY existing replenishment regardless of its status (PENDING_APPROVAL/APPROVED/PAID all claim their vouchers)", async () => {
      voucherRepository.listByFloatId.mockResolvedValue([makePcVoucher({ id: "pcv-1", amount: Money.fromInt(100) })]);
      replenishmentRepository.listByFloatId.mockResolvedValue([makeReplenishment({ voucherIds: ["pcv-1"], status: "PAID" })]);
      await expect(service.requestReplenishment(em, "float-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("onApprovalDecided()", () => {
    it("rejects a non-PENDING_APPROVAL replenishment", async () => {
      replenishmentRepository.findByIdOrFail.mockResolvedValue(makeReplenishment({ status: "APPROVED" }));
      await expect(service.onApprovalDecided(em, "repl-1", true)).rejects.toBeInstanceOf(ValidationException);
    });

    it("approved -> APPROVED", async () => {
      replenishmentRepository.findByIdOrFail.mockResolvedValue(makeReplenishment({ status: "PENDING_APPROVAL" }));
      const result = await service.onApprovalDecided(em, "repl-1", true);
      expect(result.status).toBe("APPROVED");
      expect(replenishmentRepository.delete).not.toHaveBeenCalled();
    });

    it("rejected -> the row is deleted (no REJECTED/CANCELLED status exists), releasing its claimed vouchers", async () => {
      replenishmentRepository.findByIdOrFail.mockResolvedValue(makeReplenishment({ status: "PENDING_APPROVAL" }));
      await service.onApprovalDecided(em, "repl-1", false);
      expect(replenishmentRepository.delete).toHaveBeenCalledWith("repl-1", em);
      expect(replenishmentRepository.save).not.toHaveBeenCalled();
    });
  });

  describe("execute() — P-26 exact assertions + balance-restoration arithmetic", () => {
    beforeEach(() => {
      replenishmentRepository.findByIdOrFail.mockResolvedValue(makeReplenishment({ status: "APPROVED", amount: Money.fromInt(400) }));
    });

    it("rejects a non-APPROVED replenishment", async () => {
      replenishmentRepository.findByIdOrFail.mockResolvedValue(makeReplenishment({ status: "PENDING_APPROVAL" }));
      await expect(service.execute(em, "repl-1", "exec-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("P-26: debits the Petty Cash Float account (1015), credits Bank (1020)", async () => {
      floatRepository.findByIdForUpdate.mockResolvedValue(makeFloat({ balance: Money.fromInt(1000), ceiling: Money.fromInt(5000) }));
      await service.execute(em, "repl-1", "exec-1");
      expect(glAccountRepository.findByCodeOrFail).toHaveBeenCalledWith("1015", em);
      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: "float-acc", debit: Money.fromInt(400), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "bank-acc", debit: Money.ZERO, credit: Money.fromInt(400) }),
          ],
        }),
      );
    });

    it("restores balance by exactly the replenished amount when under ceiling", async () => {
      floatRepository.findByIdForUpdate.mockResolvedValue(makeFloat({ balance: Money.fromInt(1000), ceiling: Money.fromInt(5000) }));
      await service.execute(em, "repl-1", "exec-1");
      expect(floatRepository.save).toHaveBeenCalledWith(expect.objectContaining({ balance: Money.fromInt(1400) }), em);
    });

    it("caps the restored balance at ceiling when balance+amount would exceed it", async () => {
      floatRepository.findByIdForUpdate.mockResolvedValue(makeFloat({ balance: Money.fromInt(4800), ceiling: Money.fromInt(5000) }));
      // 4800 + 400 = 5200 > ceiling 5000 -> capped to 5000
      await service.execute(em, "repl-1", "exec-1");
      expect(floatRepository.save).toHaveBeenCalledWith(expect.objectContaining({ balance: Money.fromInt(5000) }), em);
    });

    it("sets status=PAID and stamps journal_id", async () => {
      floatRepository.findByIdForUpdate.mockResolvedValue(makeFloat({ balance: Money.fromInt(1000), ceiling: Money.fromInt(5000) }));
      const result = await service.execute(em, "repl-1", "exec-1");
      expect(result.status).toBe("PAID");
      expect(result.journalId).toBe("journal-1");
    });
  });
});

import { DataSource, EntityManager } from "typeorm";
import { REFUNDS_APPROVAL_DOMAIN_CODE, RefundVouchersService } from "../application/refund-vouchers.service";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { BillRefundVoucherEntity } from "../domain/bill-refund-voucher.entity";

function makeVoucher(overrides: Partial<BillRefundVoucherEntity>): BillRefundVoucherEntity {
  return {
    id: "rv-1",
    number: "DRAFT-rv-1",
    studentId: "student-1",
    amount: Money.fromInt(200),
    method: "CASH",
    payee: {},
    status: "DRAFT",
    approvalRef: null,
    journalId: null,
    b2cTransactionId: null,
    ...overrides,
  } as BillRefundVoucherEntity;
}

describe("RefundVouchersService", () => {
  let refundVoucherRepository: { findByIdOrFail: jest.Mock; listByStudent: jest.Mock; create: jest.Mock; save: jest.Mock };
  let glAccountRepository: { findByControlDomain: jest.Mock; findByCodeOrFail: jest.Mock };
  let postingService: { post: jest.Mock };
  let numberingService: { allocate: jest.Mock };
  let studentLedgerService: { getStatement: jest.Mock; appendEntry: jest.Mock };
  let approvalEngine: { submit: jest.Mock };
  let dataSource: DataSource;
  let service: RefundVouchersService;

  beforeEach(() => {
    refundVoucherRepository = {
      findByIdOrFail: jest.fn(async () => makeVoucher({})),
      listByStudent: jest.fn(async () => []),
      create: jest.fn(async (data) => makeVoucher(data)),
      save: jest.fn(async (e) => e),
    };
    glAccountRepository = {
      findByControlDomain: jest.fn(async (domain: string) => [
        { id: `acc-${domain}`, isActive: true, isPostable: true, controlDomain: domain },
      ]),
      findByCodeOrFail: jest.fn(async (code: string) => ({ id: `acc-code-${code}`, isActive: true, isPostable: true })),
    };
    postingService = { post: jest.fn(async () => ({ id: "journal-1" })) };
    numberingService = { allocate: jest.fn(async () => "RV-000001") };
    studentLedgerService = {
      getStatement: jest.fn(async () => []),
      appendEntry: jest.fn(async () => undefined),
    };
    approvalEngine = { submit: jest.fn(async () => ({ id: "instance-1" })) };
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;

    service = new RefundVouchersService(
      refundVoucherRepository as never,
      glAccountRepository as never,
      postingService as never,
      numberingService as never,
      studentLedgerService as never,
      approvalEngine as never,
      dataSource,
    );
  });

  describe("create", () => {
    const baseInput = { studentId: "student-1", method: "CASH" as const, payee: { name: "Jane Doe" } };

    it("rejects a non-positive amount", async () => {
      await expect(service.create({ ...baseInput, amount: Money.ZERO }, "initiator-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects an amount exceeding the student's credit balance when the running balance is positive (student still owes)", async () => {
      studentLedgerService.getStatement.mockResolvedValue([{ runningBalance: Money.fromInt(500) }]);
      await expect(
        service.create({ ...baseInput, amount: Money.fromInt(1) }, "initiator-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects an amount exceeding the student's credit balance when overpaid but not by enough", async () => {
      studentLedgerService.getStatement.mockResolvedValue([{ runningBalance: Money.fromInt(-100) }]);
      await expect(
        service.create({ ...baseInput, amount: Money.fromInt(150) }, "initiator-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("accepts an amount within the student's credit balance (negative running balance = credit)", async () => {
      studentLedgerService.getStatement.mockResolvedValue([{ runningBalance: Money.fromInt(-200) }]);
      const voucher = await service.create({ ...baseInput, amount: Money.fromInt(150) }, "initiator-1");
      expect(voucher.status).toBe("DRAFT");
      expect(voucher.amount.equals(Money.fromInt(150))).toBe(true);
    });

    it("treats an empty statement as zero credit available (rejects any positive amount)", async () => {
      studentLedgerService.getStatement.mockResolvedValue([]);
      await expect(
        service.create({ ...baseInput, amount: Money.fromInt(1) }, "initiator-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("submitForApproval", () => {
    it("rejects a non-DRAFT voucher", async () => {
      refundVoucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "APPROVED_UNPAID" }));
      await expect(service.submitForApproval("rv-1", "initiator-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("calls ApprovalEngineService.submit with domainCode:'REFUNDS' and transitions to PENDING_APPROVAL", async () => {
      const result = await service.submitForApproval("rv-1", "initiator-1");

      expect(approvalEngine.submit).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          domainCode: REFUNDS_APPROVAL_DOMAIN_CODE,
          entityType: "bill_refund_voucher",
          entityId: "rv-1",
          initiatorId: "initiator-1",
        }),
      );
      expect(result.status).toBe("PENDING_APPROVAL");
      expect(result.approvalRef).toBe("instance-1");
    });
  });

  describe("onApprovalDecided", () => {
    it("rejects a voucher that is not PENDING_APPROVAL", async () => {
      refundVoucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "DRAFT" }));
      await expect(service.onApprovalDecided("rv-1", true, "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("approve -> posts P-12 (debit AR-Student, credit payout account) and lands on APPROVED_UNPAID", async () => {
      refundVoucherRepository.findByIdOrFail.mockResolvedValue(
        makeVoucher({ status: "PENDING_APPROVAL", method: "CASH", amount: Money.fromInt(200) }),
      );

      const result = await service.onApprovalDecided("rv-1", true, "actor-1");

      expect(postingService.post).toHaveBeenCalledTimes(1);
      const lines = postingService.post.mock.calls[0][1].lines as { accountId: string; debit: Money; credit: Money }[];
      const totalDebit = lines.reduce((sum: Money, l) => sum.add(l.debit), Money.ZERO);
      const totalCredit = lines.reduce((sum: Money, l) => sum.add(l.credit), Money.ZERO);
      expect(totalDebit.equals(totalCredit)).toBe(true);
      expect(totalDebit.equals(Money.fromInt(200))).toBe(true);

      const arDebit = lines.find((l) => l.accountId === "acc-AR_STUDENT");
      expect(arDebit?.debit.equals(Money.fromInt(200))).toBe(true);
      const payoutCredit = lines.find((l) => l.accountId === "acc-code-1010");
      expect(payoutCredit?.credit.equals(Money.fromInt(200))).toBe(true);

      expect(result.status).toBe("APPROVED_UNPAID");
      expect(result.journalId).toBe("journal-1");
      expect(result.number).toBe("RV-000001");

      expect(studentLedgerService.appendEntry).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ studentId: "student-1", debit: expect.objectContaining({}), credit: Money.ZERO }),
      );
      const ledgerCall = studentLedgerService.appendEntry.mock.calls[0][1];
      expect(ledgerCall.debit.equals(Money.fromInt(200))).toBe(true);
    });

    it("resolves BANK payouts against the seeded 1020 account", async () => {
      refundVoucherRepository.findByIdOrFail.mockResolvedValue(
        makeVoucher({ status: "PENDING_APPROVAL", method: "BANK", amount: Money.fromInt(100) }),
      );
      await service.onApprovalDecided("rv-1", true, "actor-1");
      expect(glAccountRepository.findByCodeOrFail).toHaveBeenCalledWith("1020", {});
    });

    it("resolves MPESA_B2C payouts against the MPESA_CLEARING control account", async () => {
      refundVoucherRepository.findByIdOrFail.mockResolvedValue(
        makeVoucher({ status: "PENDING_APPROVAL", method: "MPESA_B2C", amount: Money.fromInt(100) }),
      );
      await service.onApprovalDecided("rv-1", true, "actor-1");
      expect(glAccountRepository.findByControlDomain).toHaveBeenCalledWith("MPESA_CLEARING", {});
    });

    it("reject -> CANCELLED, no GL activity, no ledger entry", async () => {
      refundVoucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "PENDING_APPROVAL" }));

      const result = await service.onApprovalDecided("rv-1", false, "actor-1");

      expect(postingService.post).not.toHaveBeenCalled();
      expect(studentLedgerService.appendEntry).not.toHaveBeenCalled();
      expect(result.status).toBe("CANCELLED");
    });
  });

  describe("markPaid", () => {
    it("rejects a voucher that is not APPROVED_UNPAID", async () => {
      refundVoucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "DRAFT" }));
      await expect(service.markPaid("rv-1", null, "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("transitions APPROVED_UNPAID -> PAID and records an optional b2c_transaction_id", async () => {
      refundVoucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "APPROVED_UNPAID", method: "MPESA_B2C" }));
      const result = await service.markPaid("rv-1", "b2c-txn-1", "actor-1");
      expect(result.status).toBe("PAID");
      expect(result.b2cTransactionId).toBe("b2c-txn-1");
    });
  });

  describe("cancel", () => {
    it.each(["PAID", "CANCELLED"] as const)("rejects cancellation from a terminal status=%s", async (status) => {
      refundVoucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status }));
      await expect(service.cancel("rv-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it.each(["DRAFT", "PENDING_APPROVAL", "APPROVED_UNPAID"] as const)(
      "cancels successfully from pre-PAID status=%s",
      async (status) => {
        refundVoucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status }));
        const result = await service.cancel("rv-1", "actor-1");
        expect(result.status).toBe("CANCELLED");
      },
    );
  });
});

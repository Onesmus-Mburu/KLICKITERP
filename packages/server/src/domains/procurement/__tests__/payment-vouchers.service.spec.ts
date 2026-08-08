import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { GlAccountEntity } from "../../../accounting";
import { PaymentVouchersService, SUPPLIER_PAYMENTS_APPROVAL_DOMAIN_CODE } from "../application/payment-vouchers.service";
import { ProcPaymentVoucherEntity } from "../domain/proc-payment-voucher.entity";
import { ProcSupplierInvoiceEntity } from "../domain/proc-supplier-invoice.entity";
import { ProcSupplierEntity } from "../domain/proc-supplier.entity";
import { ProcVoucherAllocationEntity } from "../domain/proc-voucher-allocation.entity";

function makeVoucher(overrides: Partial<ProcPaymentVoucherEntity>): ProcPaymentVoucherEntity {
  return {
    id: "voucher-1",
    number: "DRAFT-voucher-1",
    supplierId: "supplier-1",
    method: "BANK",
    bankAccountId: null,
    chequeLeafId: null,
    total: Money.fromInt(500),
    status: "DRAFT",
    approvalRef: null,
    journalId: null,
    remittanceSent: false,
    ...overrides,
  } as ProcPaymentVoucherEntity;
}

function makeAllocation(overrides: Partial<ProcVoucherAllocationEntity>): ProcVoucherAllocationEntity {
  return {
    id: "alloc-1",
    voucherId: "voucher-1",
    supplierInvoiceId: "inv-1",
    amount: Money.fromInt(500),
    ...overrides,
  } as ProcVoucherAllocationEntity;
}

function makeInvoice(overrides: Partial<ProcSupplierInvoiceEntity>): ProcSupplierInvoiceEntity {
  return {
    id: "inv-1",
    number: "SINV-000001",
    supplierId: "supplier-1",
    total: Money.fromInt(1000),
    status: "POSTED",
    paidAmount: Money.ZERO,
    ...overrides,
  } as ProcSupplierInvoiceEntity;
}

function makeSupplier(overrides: Partial<ProcSupplierEntity> = {}): ProcSupplierEntity {
  return { id: "supplier-1", name: "Acme", status: "ACTIVE", contacts: {}, ...overrides } as ProcSupplierEntity;
}

function makeAccount(overrides: Partial<GlAccountEntity>): GlAccountEntity {
  return { id: "acc-1", code: "9999", isActive: true, isPostable: true, ...overrides } as GlAccountEntity;
}

describe("PaymentVouchersService", () => {
  let voucherRepository: { findByIdOrFail: jest.Mock; create: jest.Mock; save: jest.Mock; list: jest.Mock };
  let allocationRepository: { findByVoucherId: jest.Mock; create: jest.Mock };
  let supplierInvoiceRepository: { findByIdOrFail: jest.Mock; save: jest.Mock };
  let supplierRepository: { findByIdOrFail: jest.Mock };
  let glAccountRepository: { findByControlDomain: jest.Mock; findByCode: jest.Mock };
  let postingService: { post: jest.Mock };
  let numberingService: { allocate: jest.Mock };
  let approvalEngine: { submit: jest.Mock };
  let notificationsService: { send: jest.Mock };
  let service: PaymentVouchersService;

  const em = {} as EntityManager;

  beforeEach(() => {
    voucherRepository = {
      findByIdOrFail: jest.fn(async () => makeVoucher({})),
      create: jest.fn(async (data) => makeVoucher(data)),
      save: jest.fn(async (e) => e),
      list: jest.fn(async () => []),
    };
    allocationRepository = {
      findByVoucherId: jest.fn(async () => [makeAllocation({})]),
      create: jest.fn(async (data) => makeAllocation(data)),
    };
    supplierInvoiceRepository = {
      findByIdOrFail: jest.fn(async () => makeInvoice({})),
      save: jest.fn(async (e) => e),
    };
    supplierRepository = { findByIdOrFail: jest.fn(async () => makeSupplier()) };
    glAccountRepository = {
      findByControlDomain: jest.fn(async (domain: string) => {
        if (domain === "AP_SUPPLIER") return [makeAccount({ id: "ap-acc", code: "2010" })];
        if (domain === "MPESA_CLEARING") return [makeAccount({ id: "mpesa-acc", code: "1400" })];
        return [];
      }),
      findByCode: jest.fn(async (code: string) => {
        if (code === "2010") return makeAccount({ id: "ap-acc", code });
        if (code === "1020") return makeAccount({ id: "bank-acc", code });
        if (code === "1010") return makeAccount({ id: "cash-acc", code });
        if (code === "1030") return makeAccount({ id: "cheque-acc", code });
        return null;
      }),
    };
    postingService = { post: jest.fn(async () => ({ id: "journal-1", lines: [] })) };
    numberingService = { allocate: jest.fn(async () => "PV-000001") };
    approvalEngine = { submit: jest.fn(async () => ({ id: "approval-1" })) };
    notificationsService = { send: jest.fn(async () => ({ status: "SENT" })) };

    service = new PaymentVouchersService(
      voucherRepository as never,
      allocationRepository as never,
      supplierInvoiceRepository as never,
      supplierRepository as never,
      glAccountRepository as never,
      postingService as never,
      numberingService as never,
      approvalEngine as never,
      notificationsService as never,
    );
  });

  describe("create", () => {
    it("rejects zero allocations", async () => {
      await expect(
        service.create(em, { supplierId: "supplier-1", method: "BANK", allocations: [] }, "actor-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a non-positive allocation amount", async () => {
      await expect(
        service.create(
          em,
          { supplierId: "supplier-1", method: "BANK", allocations: [{ supplierInvoiceId: "inv-1", amount: Money.ZERO }] },
          "actor-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects an invoice belonging to a different supplier", async () => {
      supplierInvoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ supplierId: "other-supplier" }));
      await expect(
        service.create(
          em,
          { supplierId: "supplier-1", method: "BANK", allocations: [{ supplierInvoiceId: "inv-1", amount: Money.fromInt(100) }] },
          "actor-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("BR-PROC-04: rejects an invoice not open (status)", async () => {
      supplierInvoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ status: "UNMATCHED" }));
      await expect(
        service.create(
          em,
          { supplierId: "supplier-1", method: "BANK", allocations: [{ supplierInvoiceId: "inv-1", amount: Money.fromInt(100) }] },
          "actor-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("BR-PROC-04: rejects an allocation exceeding the invoice's open balance", async () => {
      supplierInvoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ total: Money.fromInt(1000), paidAmount: Money.fromInt(900) })); // open balance 100
      await expect(
        service.create(
          em,
          { supplierId: "supplier-1", method: "BANK", allocations: [{ supplierInvoiceId: "inv-1", amount: Money.fromInt(150) }] },
          "actor-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("creates a DRAFT voucher with total = sum(allocations) and a placeholder number", async () => {
      const voucher = await service.create(
        em,
        {
          supplierId: "supplier-1",
          method: "MPESA",
          allocations: [{ supplierInvoiceId: "inv-1", amount: Money.fromInt(400) }],
        },
        "actor-1",
      );
      expect(voucher.status).toBe("DRAFT");
      expect(voucher.total).toEqual(Money.fromInt(400));
      expect(voucher.number).toMatch(/^DRAFT-/);
      expect(allocationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ supplierInvoiceId: "inv-1", amount: Money.fromInt(400) }),
        em,
      );
    });
  });

  describe("submitForApproval", () => {
    it("rejects a non-DRAFT voucher", async () => {
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "APPROVED" }));
      await expect(service.submitForApproval(em, "voucher-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a voucher with no allocations", async () => {
      allocationRepository.findByVoucherId.mockResolvedValue([]);
      await expect(service.submitForApproval(em, "voucher-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("submits under SUPPLIER_PAYMENTS and moves to PENDING_APPROVAL", async () => {
      const result = await service.submitForApproval(em, "voucher-1", "actor-1");
      expect(approvalEngine.submit).toHaveBeenCalledWith(
        em,
        expect.objectContaining({ domainCode: SUPPLIER_PAYMENTS_APPROVAL_DOMAIN_CODE, entityType: "proc_payment_voucher" }),
      );
      expect(result.status).toBe("PENDING_APPROVAL");
      expect(result.approvalRef).toBe("approval-1");
    });
  });

  describe("onApprovalDecided", () => {
    it("rejects a non-PENDING_APPROVAL voucher", async () => {
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "DRAFT" }));
      await expect(service.onApprovalDecided("voucher-1", true)).rejects.toBeInstanceOf(ValidationException);
    });

    it("approved -> APPROVED", async () => {
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "PENDING_APPROVAL" }));
      const result = await service.onApprovalDecided("voucher-1", true, "actor-1");
      expect(result.status).toBe("APPROVED");
    });

    it("rejected -> DRAFT", async () => {
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "PENDING_APPROVAL" }));
      const result = await service.onApprovalDecided("voucher-1", false, "actor-1");
      expect(result.status).toBe("DRAFT");
    });
  });

  describe("execute", () => {
    beforeEach(() => {
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "APPROVED", total: Money.fromInt(500) }));
      allocationRepository.findByVoucherId.mockResolvedValue([makeAllocation({ amount: Money.fromInt(500) })]);
      supplierInvoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ total: Money.fromInt(1000), paidAmount: Money.ZERO }));
    });

    it("rejects a non-APPROVED voucher", async () => {
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "DRAFT" }));
      await expect(service.execute(em, "voucher-1", "exec-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("BR-PROC-04: re-checks at execution time and rejects if the invoice's CURRENT open balance is now insufficient", async () => {
      supplierInvoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ total: Money.fromInt(1000), paidAmount: Money.fromInt(600) })); // open balance 400 < allocation 500
      await expect(service.execute(em, "voucher-1", "exec-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("P-21 BANK: debits AP for total, credits the bank clearing account (1020)", async () => {
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "APPROVED", total: Money.fromInt(500), method: "BANK" }));
      await service.execute(em, "voucher-1", "exec-1");
      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: "ap-acc", debit: Money.fromInt(500), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "bank-acc", debit: Money.ZERO, credit: Money.fromInt(500) }),
          ],
        }),
      );
    });

    it("P-21 CASH: credits the cash clearing account (1010)", async () => {
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "APPROVED", total: Money.fromInt(500), method: "CASH" }));
      await service.execute(em, "voucher-1", "exec-1");
      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({ lines: expect.arrayContaining([expect.objectContaining({ accountId: "cash-acc", credit: Money.fromInt(500) })]) }),
      );
    });

    it("P-21 CHEQUE: credits the cheque clearing account (1030)", async () => {
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "APPROVED", total: Money.fromInt(500), method: "CHEQUE" }));
      await service.execute(em, "voucher-1", "exec-1");
      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({ lines: expect.arrayContaining([expect.objectContaining({ accountId: "cheque-acc", credit: Money.fromInt(500) })]) }),
      );
    });

    it("P-21 MPESA: credits the MPESA_CLEARING control account", async () => {
      voucherRepository.findByIdOrFail.mockResolvedValue(makeVoucher({ status: "APPROVED", total: Money.fromInt(500), method: "MPESA" }));
      await service.execute(em, "voucher-1", "exec-1");
      expect(glAccountRepository.findByControlDomain).toHaveBeenCalledWith("MPESA_CLEARING", em);
      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({ lines: expect.arrayContaining([expect.objectContaining({ accountId: "mpesa-acc", credit: Money.fromInt(500) })]) }),
      );
    });

    it("updates the allocated invoice's paid_amount/status (PARTIALLY_PAID when not fully settled)", async () => {
      supplierInvoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ total: Money.fromInt(1000), paidAmount: Money.ZERO }));
      await service.execute(em, "voucher-1", "exec-1");
      expect(supplierInvoiceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ paidAmount: Money.fromInt(500), status: "PARTIALLY_PAID" }),
        em,
      );
    });

    it("updates the allocated invoice's status to PAID when fully settled", async () => {
      supplierInvoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ total: Money.fromInt(500), paidAmount: Money.ZERO }));
      await service.execute(em, "voucher-1", "exec-1");
      expect(supplierInvoiceRepository.save).toHaveBeenCalledWith(expect.objectContaining({ paidAmount: Money.fromInt(500), status: "PAID" }), em);
    });

    it("allocates the real number, sets status=PAID, and stamps journal_id", async () => {
      const result = await service.execute(em, "voucher-1", "exec-1");
      expect(numberingService.allocate).toHaveBeenCalledWith(em, "PROC_PAYMENT_VOUCHER");
      expect(result.number).toBe("PV-000001");
      expect(result.status).toBe("PAID");
      expect(result.journalId).toBe("journal-1");
    });

    it("remittance advice: sends and sets remittance_sent=true when contacts.email is present and the send succeeds", async () => {
      supplierRepository.findByIdOrFail.mockResolvedValue(makeSupplier({ contacts: { email: "ap@acme.co.ke" } }));
      const result = await service.execute(em, "voucher-1", "exec-1");
      expect(notificationsService.send).toHaveBeenCalledWith(expect.objectContaining({ channel: "EMAIL", recipient: "ap@acme.co.ke" }));
      expect(result.remittanceSent).toBe(true);
    });

    it("remittance advice: never attempts a send when contacts has no email, remittance_sent stays false", async () => {
      supplierRepository.findByIdOrFail.mockResolvedValue(makeSupplier({ contacts: {} }));
      const result = await service.execute(em, "voucher-1", "exec-1");
      expect(notificationsService.send).not.toHaveBeenCalled();
      expect(result.remittanceSent).toBe(false);
    });

    it("remittance advice: a thrown send error never fails execute()", async () => {
      supplierRepository.findByIdOrFail.mockResolvedValue(makeSupplier({ contacts: { email: "ap@acme.co.ke" } }));
      notificationsService.send.mockRejectedValue(new Error("smtp down"));
      const result = await service.execute(em, "voucher-1", "exec-1");
      expect(result.status).toBe("PAID");
      expect(result.remittanceSent).toBe(false);
    });
  });
});

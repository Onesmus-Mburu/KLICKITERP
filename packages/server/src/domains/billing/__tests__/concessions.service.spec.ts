import { DataSource, EntityManager } from "typeorm";
import { BILLING_CONCESSION_APPROVAL_DOMAIN_CODE, ConcessionsService } from "../application/concessions.service";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { BillConcessionEntity } from "../domain/bill-concession.entity";
import { BillInvoiceEntity } from "../domain/bill-invoice.entity";

function makeConcession(overrides: Partial<BillConcessionEntity>): BillConcessionEntity {
  return {
    id: "conc-1",
    kind: "DISCOUNT",
    schemeId: "scheme-1",
    studentId: "student-1",
    invoiceId: "invoice-1",
    invoiceLineId: null,
    sponsorAwardId: null,
    amount: Money.fromInt(200),
    reason: "Sibling discount",
    status: "PENDING_APPROVAL",
    approvalRef: null,
    journalId: null,
    ...overrides,
  } as BillConcessionEntity;
}

function makeInvoice(overrides: Partial<BillInvoiceEntity>): BillInvoiceEntity {
  return {
    id: "invoice-1",
    number: "INV-000001",
    studentId: "student-1",
    status: "POSTED",
    subtotal: Money.fromInt(1000),
    concessionTotal: Money.ZERO,
    total: Money.fromInt(1000),
    paidAmount: Money.ZERO,
    balance: Money.fromInt(1000),
    ...overrides,
  } as BillInvoiceEntity;
}

describe("ConcessionsService", () => {
  let concessionRepository: {
    findByIdOrFail: jest.Mock;
    listByInvoice: jest.Mock;
    listByStudent: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let schemeRepository: { findByIdOrFail: jest.Mock };
  let invoiceRepository: { findByIdOrFail: jest.Mock; save: jest.Mock };
  let invoiceLineRepository: { findByIdOrFail: jest.Mock };
  let glAccountRepository: { findByControlDomain: jest.Mock };
  let postingService: { post: jest.Mock };
  let studentLedgerService: { appendEntry: jest.Mock };
  let approvalEngine: { submit: jest.Mock };
  let dataSource: DataSource;
  let service: ConcessionsService;

  beforeEach(() => {
    concessionRepository = {
      findByIdOrFail: jest.fn(async () => makeConcession({})),
      listByInvoice: jest.fn(async () => []),
      listByStudent: jest.fn(async () => []),
      create: jest.fn(async (data) => makeConcession(data)),
      save: jest.fn(async (e) => e),
    };
    schemeRepository = { findByIdOrFail: jest.fn(async () => ({ id: "scheme-1", glAccountId: "acc-concession-1" })) };
    invoiceRepository = { findByIdOrFail: jest.fn(async () => makeInvoice({})), save: jest.fn(async (e) => e) };
    invoiceLineRepository = { findByIdOrFail: jest.fn(async () => ({ id: "line-1", invoiceId: "invoice-1" })) };
    glAccountRepository = {
      findByControlDomain: jest.fn(async (domain: string) => [
        { id: `acc-${domain}`, isActive: true, isPostable: true, controlDomain: domain },
      ]),
    };
    postingService = { post: jest.fn(async () => ({ id: "journal-1" })) };
    studentLedgerService = { appendEntry: jest.fn(async () => undefined) };
    approvalEngine = { submit: jest.fn(async () => ({ id: "instance-1" })) };
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;

    service = new ConcessionsService(
      concessionRepository as never,
      schemeRepository as never,
      invoiceRepository as never,
      invoiceLineRepository as never,
      glAccountRepository as never,
      postingService as never,
      studentLedgerService as never,
      approvalEngine as never,
      dataSource,
    );
  });

  describe("requestConcession", () => {
    const baseInput = {
      kind: "DISCOUNT" as const,
      schemeId: "scheme-1",
      studentId: "student-1",
      amount: Money.fromInt(200),
      reason: "Sibling discount",
    };

    it("rejects when neither invoiceId nor invoiceLineId is set", async () => {
      await expect(service.requestConcession({ ...baseInput }, "initiator-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects when BOTH invoiceId and invoiceLineId are set", async () => {
      await expect(
        service.requestConcession({ ...baseInput, invoiceId: "invoice-1", invoiceLineId: "line-1" }, "initiator-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a non-positive amount", async () => {
      await expect(
        service.requestConcession({ ...baseInput, invoiceId: "invoice-1", amount: Money.ZERO }, "initiator-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a concession with neither scheme_id nor sponsor_award_id", async () => {
      await expect(
        service.requestConcession({ ...baseInput, schemeId: undefined, invoiceId: "invoice-1" }, "initiator-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("creates PENDING_APPROVAL and calls ApprovalEngineService.submit with the right domain code", async () => {
      const result = await service.requestConcession({ ...baseInput, invoiceId: "invoice-1" }, "initiator-1");

      expect(approvalEngine.submit).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          domainCode: BILLING_CONCESSION_APPROVAL_DOMAIN_CODE,
          entityType: "bill_concession",
          initiatorId: "initiator-1",
        }),
      );
      expect(result.status).toBe("PENDING_APPROVAL");
      expect(result.approvalRef).toBe("instance-1");
    });
  });

  describe("onApprovalDecided", () => {
    it("rejects a concession that is not PENDING_APPROVAL", async () => {
      concessionRepository.findByIdOrFail.mockResolvedValue(makeConcession({ status: "APPROVED" }));
      await expect(service.onApprovalDecided("conc-1", true, "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("approved=true transitions to APPROVED", async () => {
      const result = await service.onApprovalDecided("conc-1", true, "actor-1");
      expect(result.status).toBe("APPROVED");
    });

    it("approved=false transitions to REJECTED", async () => {
      const result = await service.onApprovalDecided("conc-1", false, "actor-1");
      expect(result.status).toBe("REJECTED");
    });
  });

  describe("postStandalone", () => {
    it("rejects a concession that is not APPROVED", async () => {
      concessionRepository.findByIdOrFail.mockResolvedValue(makeConcession({ status: "PENDING_APPROVAL" }));
      await expect(service.postStandalone("conc-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects targeting a DRAFT invoice (must fold in at post time instead)", async () => {
      concessionRepository.findByIdOrFail.mockResolvedValue(makeConcession({ status: "APPROVED" }));
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ status: "DRAFT" }));
      await expect(service.postStandalone("conc-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a concession amount exceeding the invoice's balance (BR-BILL-06)", async () => {
      concessionRepository.findByIdOrFail.mockResolvedValue(
        makeConcession({ status: "APPROVED", amount: Money.fromInt(5000) }),
      );
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ balance: Money.fromInt(1000) }));
      await expect(service.postStandalone("conc-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("posts a P-02 journal (scheme-backed, WAIVER/DISCOUNT) and reuses paid_amount/balance as the reduction lever", async () => {
      concessionRepository.findByIdOrFail.mockResolvedValue(
        makeConcession({ status: "APPROVED", kind: "DISCOUNT", schemeId: "scheme-1", sponsorAwardId: null, amount: Money.fromInt(200) }),
      );
      invoiceRepository.findByIdOrFail.mockResolvedValue(
        makeInvoice({ status: "POSTED", total: Money.fromInt(1000), paidAmount: Money.ZERO, balance: Money.fromInt(1000) }),
      );

      const result = await service.postStandalone("conc-1", "actor-1");

      expect(postingService.post).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: "acc-concession-1", debit: expect.objectContaining({}), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "acc-AR_STUDENT", debit: Money.ZERO }),
          ],
        }),
      );
      const postedLines = postingService.post.mock.calls[0][1].lines;
      expect(postedLines[0].debit.equals(Money.fromInt(200))).toBe(true);
      expect(postedLines[1].credit.equals(Money.fromInt(200))).toBe(true);

      expect(invoiceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          paidAmount: expect.objectContaining({}),
          balance: expect.objectContaining({}),
        }),
        {},
      );
      const savedInvoice = invoiceRepository.save.mock.calls[0][0];
      expect(savedInvoice.paidAmount.equals(Money.fromInt(200))).toBe(true);
      expect(savedInvoice.balance.equals(Money.fromInt(800))).toBe(true);
      expect(savedInvoice.status).toBe("PARTIALLY_PAID");

      expect(studentLedgerService.appendEntry).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ studentId: "student-1", credit: expect.objectContaining({}) }),
      );

      expect(result.status).toBe("POSTED");
      expect(result.journalId).toBe("journal-1");
    });

    it("posts a P-03 journal (sponsor-linked) debiting AR-Sponsor instead of a scheme account", async () => {
      concessionRepository.findByIdOrFail.mockResolvedValue(
        makeConcession({ status: "APPROVED", kind: "SCHOLARSHIP", schemeId: null, sponsorAwardId: "award-1", amount: Money.fromInt(300) }),
      );
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ balance: Money.fromInt(1000) }));

      await service.postStandalone("conc-1", "actor-1");

      const postedLines = postingService.post.mock.calls[0][1].lines;
      expect(postedLines[0].accountId).toBe("acc-AR_SPONSOR");
      expect(postedLines[0].debit.equals(Money.fromInt(300))).toBe(true);
    });

    it("fully covers the balance -> invoice status flips to PAID", async () => {
      concessionRepository.findByIdOrFail.mockResolvedValue(
        makeConcession({ status: "APPROVED", amount: Money.fromInt(1000) }),
      );
      invoiceRepository.findByIdOrFail.mockResolvedValue(
        makeInvoice({ paidAmount: Money.ZERO, balance: Money.fromInt(1000) }),
      );

      await service.postStandalone("conc-1", "actor-1");

      const savedInvoice = invoiceRepository.save.mock.calls[0][0];
      expect(savedInvoice.balance.isZero()).toBe(true);
      expect(savedInvoice.status).toBe("PAID");
    });
  });
});

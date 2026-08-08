import { DataSource, EntityManager } from "typeorm";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { QuotationsService } from "../application/quotations.service";
import { ProcQuotationEntity } from "../domain/proc-quotation.entity";
import { ProcRequisitionEntity } from "../domain/proc-requisition.entity";

function makeQuotation(overrides: Partial<ProcQuotationEntity>): ProcQuotationEntity {
  return {
    id: "quote-1",
    requisitionId: "req-1",
    supplierId: "supplier-1",
    quoteDate: "2026-07-01",
    validUntil: null,
    documentFileId: null,
    total: Money.fromInt(500),
    terms: null,
    isAwarded: false,
    awardReason: null,
    ...overrides,
  } as ProcQuotationEntity;
}

function makeRequisition(overrides: Partial<ProcRequisitionEntity>): ProcRequisitionEntity {
  return {
    id: "req-1",
    status: "APPROVED",
    ...overrides,
  } as ProcRequisitionEntity;
}

describe("QuotationsService", () => {
  let quotationRepository: {
    findByIdOrFail: jest.Mock;
    findByRequisitionId: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let quotationLineRepository: { findByQuotationId: jest.Mock; create: jest.Mock };
  let requisitionRepository: { findByIdOrFail: jest.Mock };
  let dataSource: DataSource;
  let service: QuotationsService;

  const em = {} as EntityManager;

  beforeEach(() => {
    quotationRepository = {
      findByIdOrFail: jest.fn(),
      findByRequisitionId: jest.fn(async () => []),
      create: jest.fn(async (data) => makeQuotation(data)),
      save: jest.fn(async (e) => e),
    };
    quotationLineRepository = {
      findByQuotationId: jest.fn(async () => []),
      create: jest.fn(async (data) => data),
    };
    requisitionRepository = { findByIdOrFail: jest.fn(async () => makeRequisition({})) };
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) => work(em)),
    } as unknown as DataSource;

    service = new QuotationsService(
      quotationRepository as never,
      quotationLineRepository as never,
      requisitionRepository as never,
      dataSource,
    );
  });

  describe("create", () => {
    it("rejects zero lines", async () => {
      await expect(
        service.create(
          { requisitionId: "req-1", supplierId: "supplier-1", quoteDate: "2026-07-01", lines: [] },
          "actor-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a quotation against a non-APPROVED requisition", async () => {
      requisitionRepository.findByIdOrFail.mockResolvedValue(makeRequisition({ status: "SUBMITTED" }));
      await expect(
        service.create(
          {
            requisitionId: "req-1",
            supplierId: "supplier-1",
            quoteDate: "2026-07-01",
            lines: [{ description: "Item A", qty: "2", unitPrice: Money.fromInt(100) }],
          },
          "actor-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("computes total from lines and creates quotation + lines atomically", async () => {
      const result = await service.create(
        {
          requisitionId: "req-1",
          supplierId: "supplier-1",
          quoteDate: "2026-07-01",
          lines: [
            { description: "Item A", qty: "2", unitPrice: Money.fromInt(100) },
            { description: "Item B", qty: "1", unitPrice: Money.fromInt(50) },
          ],
        },
        "actor-1",
      );
      expect(result.total).toEqual(Money.fromInt(250));
      expect(quotationLineRepository.create).toHaveBeenCalledTimes(2);
    });
  });

  describe("award", () => {
    it("rejects an already-awarded quotation", async () => {
      quotationRepository.findByIdOrFail.mockResolvedValue(makeQuotation({ isAwarded: true }));
      await expect(service.award(em, "quote-1", "best price", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects an empty awardReason", async () => {
      quotationRepository.findByIdOrFail.mockResolvedValue(makeQuotation({ isAwarded: false }));
      await expect(service.award(em, "quote-1", "  ", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("sets is_awarded=true and award_reason", async () => {
      quotationRepository.findByIdOrFail.mockResolvedValue(makeQuotation({ isAwarded: false }));
      const result = await service.award(em, "quote-1", "best price", "actor-1");
      expect(result.isAwarded).toBe(true);
      expect(result.awardReason).toBe("best price");
    });

    it("catches a uq_award_p unique-violation and rethrows ConflictException — never pre-checks", async () => {
      quotationRepository.findByIdOrFail.mockResolvedValue(makeQuotation({ isAwarded: false }));
      quotationRepository.save.mockRejectedValue({ code: "23505" });
      await expect(service.award(em, "quote-1", "best price", "actor-1")).rejects.toBeInstanceOf(ConflictException);
    });

    it("rethrows an unrelated save error unchanged", async () => {
      quotationRepository.findByIdOrFail.mockResolvedValue(makeQuotation({ isAwarded: false }));
      const unrelated = new Error("connection reset");
      quotationRepository.save.mockRejectedValue(unrelated);
      await expect(service.award(em, "quote-1", "best price", "actor-1")).rejects.toBe(unrelated);
    });
  });
});

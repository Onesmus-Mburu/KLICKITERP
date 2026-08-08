import { DataSource, EntityManager } from "typeorm";
import { DebitNotesService } from "../application/debit-notes.service";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { BillDebitNoteEntity } from "../domain/bill-debit-note.entity";
import { BillDebitNoteLineEntity } from "../domain/bill-debit-note-line.entity";

const EM = {} as EntityManager;

function makeDebitNote(overrides: Partial<BillDebitNoteEntity>): BillDebitNoteEntity {
  return {
    id: "dn-1",
    number: "DRAFT-dn-1",
    studentId: "student-1",
    termId: "term-1",
    invoiceId: null,
    reason: "Damaged library book",
    status: "DRAFT",
    approvalRef: null,
    journalId: null,
    total: Money.fromInt(300),
    ...overrides,
  } as BillDebitNoteEntity;
}

function makeDebitNoteLine(overrides: Partial<BillDebitNoteLineEntity>): BillDebitNoteLineEntity {
  return {
    id: `dnl-${overrides.lineNo ?? 1}`,
    debitNoteId: "dn-1",
    lineNo: 1,
    feeCategoryId: "cat-other",
    description: "Damaged library book",
    amount: Money.fromInt(300),
    ...overrides,
  } as BillDebitNoteLineEntity;
}

describe("DebitNotesService", () => {
  let debitNoteRepository: { findByIdOrFail: jest.Mock; listByStudent: jest.Mock; create: jest.Mock; save: jest.Mock };
  let debitNoteLineRepository: { listByDebitNote: jest.Mock; create: jest.Mock };
  let invoicingService: { generateInvoice: jest.Mock; postInvoice: jest.Mock };
  let numberingService: { allocate: jest.Mock };
  let dataSource: DataSource;
  let service: DebitNotesService;

  beforeEach(() => {
    debitNoteRepository = {
      findByIdOrFail: jest.fn(async () => makeDebitNote({})),
      listByStudent: jest.fn(async () => []),
      create: jest.fn(async (data) => makeDebitNote(data)),
      save: jest.fn(async (e) => e),
    };
    debitNoteLineRepository = {
      listByDebitNote: jest.fn(async () => [makeDebitNoteLine({})]),
      create: jest.fn(async (data) => makeDebitNoteLine(data)),
    };
    invoicingService = {
      generateInvoice: jest.fn(async () => ({ id: "invoice-1" })),
      postInvoice: jest.fn(async () => ({ id: "invoice-1", journalId: "journal-1" })),
    };
    numberingService = { allocate: jest.fn(async () => "DN-000001") };
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;

    service = new DebitNotesService(
      debitNoteRepository as never,
      debitNoteLineRepository as never,
      invoicingService as never,
      numberingService as never,
      dataSource,
    );
  });

  describe("create", () => {
    const baseInput = { studentId: "student-1", termId: "term-1", reason: "Damaged library book" };

    it("rejects an empty lines array", async () => {
      await expect(service.create({ ...baseInput, lines: [] }, "initiator-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a non-positive line amount", async () => {
      await expect(
        service.create(
          { ...baseInput, lines: [{ feeCategoryId: "cat-other", description: "x", amount: Money.ZERO }] },
          "initiator-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("builds a DRAFT note + lines, summing total", async () => {
      const note = await service.create(
        {
          ...baseInput,
          lines: [
            { feeCategoryId: "cat-other", description: "Damaged book", amount: Money.fromInt(300) },
            { feeCategoryId: "cat-other", description: "Late return fee", amount: Money.fromInt(50) },
          ],
        },
        "initiator-1",
      );

      expect(note.status).toBe("DRAFT");
      expect(debitNoteLineRepository.create).toHaveBeenCalledTimes(2);
      const created = debitNoteRepository.create.mock.calls[0][0];
      expect(created.total.equals(Money.fromInt(350))).toBe(true);
      expect(created.invoiceId).toBeNull();
    });
  });

  describe("post", () => {
    it("rejects a non-DRAFT debit note", async () => {
      debitNoteRepository.findByIdOrFail.mockResolvedValue(makeDebitNote({ status: "POSTED" }));
      await expect(service.post(EM, "dn-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("throws when term_id is missing (data integrity issue)", async () => {
      debitNoteRepository.findByIdOrFail.mockResolvedValue(makeDebitNote({ termId: null }));
      await expect(service.post(EM, "dn-1", "actor-1")).rejects.toThrow();
    });

    it("rejects a debit note with no lines", async () => {
      debitNoteLineRepository.listByDebitNote.mockResolvedValue([]);
      await expect(service.post(EM, "dn-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("delegates to InvoicingService.generateInvoice()+.postInvoice() with source:'DEBIT_NOTE'", async () => {
      debitNoteLineRepository.listByDebitNote.mockResolvedValue([
        makeDebitNoteLine({ id: "dnl-1", lineNo: 1, feeCategoryId: "cat-other", description: "Damaged book", amount: Money.fromInt(300) }),
      ]);

      await service.post(EM, "dn-1", "actor-1");

      expect(invoicingService.generateInvoice).toHaveBeenCalledWith(
        EM,
        expect.objectContaining({
          studentId: "student-1",
          termId: "term-1",
          source: "DEBIT_NOTE",
          adhocLines: [
            expect.objectContaining({ feeCategoryId: "cat-other", description: "Damaged book", amount: expect.objectContaining({}) }),
          ],
          createdBy: "actor-1",
        }),
      );
      expect(invoicingService.postInvoice).toHaveBeenCalledWith(EM, "invoice-1", "actor-1");
    });

    it("ends up POSTED with the created invoice's id + journal id recorded (migration 0072 columns)", async () => {
      invoicingService.generateInvoice.mockResolvedValue({ id: "invoice-42" });
      invoicingService.postInvoice.mockResolvedValue({ id: "invoice-42", journalId: "journal-42" });

      const result = await service.post(EM, "dn-1", "actor-1");

      expect(result.status).toBe("POSTED");
      expect(result.invoiceId).toBe("invoice-42");
      expect(result.journalId).toBe("journal-42");
      expect(result.number).toBe("DN-000001");
    });
  });
});

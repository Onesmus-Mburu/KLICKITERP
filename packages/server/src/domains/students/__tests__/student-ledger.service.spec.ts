import { EntityManager } from "typeorm";
import { Money } from "../../../shared/money/money";
import { StudentLedgerService } from "../application/student-ledger.service";

describe("StudentLedgerService", () => {
  let ledgerEntryRepository: { create: jest.Mock; getStatementWithRunningBalance: jest.Mock };
  let service: StudentLedgerService;
  let em: EntityManager;

  beforeEach(() => {
    ledgerEntryRepository = {
      create: jest.fn(async (data, manager) => ({ id: "entry-1", ...data, manager })),
      getStatementWithRunningBalance: jest.fn(async () => []),
    };
    em = { __marker: "caller-em" } as unknown as EntityManager;
    service = new StudentLedgerService(ledgerEntryRepository as never);
  });

  describe("appendEntry — the sole intended write path", () => {
    it("inserts using the CALLER's EntityManager, not a transaction of its own", async () => {
      await service.appendEntry(em, {
        studentId: "student-1",
        entryDate: "2026-01-15",
        docType: "INVOICE",
        docId: "doc-1",
        docNumber: "INV-001",
        debit: Money.fromInt(100),
        credit: Money.ZERO,
      });

      expect(ledgerEntryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ studentId: "student-1", docType: "INVOICE" }),
        em,
      );
    });

    it("never touches a DataSource/transaction — appendEntry has no such dependency at all", () => {
      // Structural assertion: the service's only collaborator is the repository.
      expect(Object.keys(service as unknown as Record<string, unknown>)).toEqual(["ledgerEntryRepository"]);
    });

    it("defaults memo to null when omitted", async () => {
      await service.appendEntry(em, {
        studentId: "student-1",
        entryDate: "2026-01-15",
        docType: "RECEIPT",
        docId: "doc-2",
        docNumber: "RCT-001",
        debit: Money.ZERO,
        credit: Money.fromInt(50),
      });
      expect(ledgerEntryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ memo: null }),
        em,
      );
    });

    it("stamps postedAt with a fresh Date at append time", async () => {
      const before = Date.now();
      await service.appendEntry(em, {
        studentId: "student-1",
        entryDate: "2026-01-15",
        docType: "RECEIPT",
        docId: "doc-3",
        docNumber: "RCT-002",
        debit: Money.ZERO,
        credit: Money.fromInt(50),
      });
      const call = ledgerEntryRepository.create.mock.calls[0][0] as { postedAt: Date };
      expect(call.postedAt.getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  describe("getStatement", () => {
    it("delegates to the repository's running-balance window-function query", async () => {
      await service.getStatement("student-1");
      expect(ledgerEntryRepository.getStatementWithRunningBalance).toHaveBeenCalledWith("student-1");
    });
  });
});

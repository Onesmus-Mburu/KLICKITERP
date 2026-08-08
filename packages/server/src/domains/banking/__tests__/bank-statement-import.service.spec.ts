import { createHash } from "node:crypto";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { BankStatementImportService } from "../application/bank-statement-import.service";
import { BankAccountEntity } from "../domain/bank-account.entity";
import { BankStatementLineEntity } from "../domain/bank-statement-line.entity";

function makeAccount(): BankAccountEntity {
  return { id: "acc-1", name: "Main Bank" } as BankAccountEntity;
}

function expectedHash(accountId: string, date: string, signedAmount: string, ref: string | null): string {
  const canonical = `${accountId}|${date}|${signedAmount}|${ref ?? ""}`;
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

describe("BankStatementImportService", () => {
  let bankAccountRepository: { findByIdOrFail: jest.Mock };
  let statementImportRepository: { create: jest.Mock; findByIdOrFail: jest.Mock; list: jest.Mock };
  let statementLineRepository: { findByAccountAndDedupeHash: jest.Mock; create: jest.Mock };
  let service: BankStatementImportService;

  const em = {} as EntityManager;

  beforeEach(() => {
    bankAccountRepository = { findByIdOrFail: jest.fn(async () => makeAccount()) };
    statementImportRepository = {
      create: jest.fn(async (data) => ({ id: "import-1", ...data })),
      findByIdOrFail: jest.fn(),
      list: jest.fn(),
    };
    statementLineRepository = {
      findByAccountAndDedupeHash: jest.fn(async () => null),
      create: jest.fn(async (data) => ({ id: "line-x", ...data })),
    };

    service = new BankStatementImportService(bankAccountRepository as never, statementImportRepository as never, statementLineRepository as never);
  });

  it("SEPARATE_COLUMNS: parses debit/credit columns and computes the exact dedupe hash", async () => {
    const rawRows = [{ Date: "2026-01-10", Description: "Deposit", Debit: "100.00", Credit: "", Ref: "REF-1" }];
    const result = await service.importLines(em, {
      accountId: "acc-1",
      fileId: "file-1",
      mappingTemplate: {
        columnMap: { date: "Date", description: "Description", debit: "Debit", credit: "Credit", ref: "Ref" },
        dateFormat: "YYYY-MM-DD",
        debitCreditConvention: "SEPARATE_COLUMNS",
      },
      rawRows,
    });

    expect(result.insertedCount).toBe(1);
    expect(result.duplicateCount).toBe(0);
    const createdLine = statementLineRepository.create.mock.calls[0][0];
    expect(createdLine.debit.toDecimalString()).toBe("100.0000");
    expect(createdLine.credit.toDecimalString()).toBe("0.0000");
    expect(createdLine.dedupeHash).toBe(expectedHash("acc-1", "2026-01-10", "100.0000", "REF-1"));
  });

  it("SIGNED_AMOUNT: negative amount maps to credit, positive to debit", async () => {
    const rawRows = [
      { Date: "10/01/2026", Description: "Charge", Amount: "-50.00" },
      { Date: "10/01/2026", Description: "Deposit", Amount: "75.50" },
    ];
    await service.importLines(em, {
      accountId: "acc-1",
      fileId: "file-1",
      mappingTemplate: {
        columnMap: { date: "Date", description: "Description", amount: "Amount" },
        dateFormat: "DD/MM/YYYY",
        debitCreditConvention: "SIGNED_AMOUNT",
      },
      rawRows,
    });

    const [chargeLine, depositLine] = statementLineRepository.create.mock.calls.map((call) => call[0]);
    expect(chargeLine.debit.toDecimalString()).toBe("0.0000");
    expect(chargeLine.credit.toDecimalString()).toBe("50.0000");
    expect(depositLine.debit.toDecimalString()).toBe("75.5000");
    expect(depositLine.credit.toDecimalString()).toBe("0.0000");
  });

  it("skips and counts an existing dedupe hash as a duplicate, never re-inserting it", async () => {
    statementLineRepository.findByAccountAndDedupeHash.mockResolvedValueOnce({ id: "existing-line" } as BankStatementLineEntity);
    const rawRows = [{ Date: "2026-01-10", Description: "Deposit", Amount: "100.00" }];
    const result = await service.importLines(em, {
      accountId: "acc-1",
      fileId: "file-1",
      mappingTemplate: {
        columnMap: { date: "Date", description: "Description", amount: "Amount" },
        dateFormat: "YYYY-MM-DD",
        debitCreditConvention: "SIGNED_AMOUNT",
      },
      rawRows,
    });

    expect(result.insertedCount).toBe(0);
    expect(result.duplicateCount).toBe(1);
    expect(statementLineRepository.create).not.toHaveBeenCalled();
  });

  it("records line_count/duplicate_count on the bank_statement_import row", async () => {
    statementLineRepository.findByAccountAndDedupeHash
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "dup" } as BankStatementLineEntity);
    const rawRows = [
      { Date: "2026-01-10", Description: "A", Amount: "10.00" },
      { Date: "2026-01-11", Description: "B", Amount: "20.00" },
    ];
    await service.importLines(em, {
      accountId: "acc-1",
      fileId: "file-1",
      mappingTemplate: {
        columnMap: { date: "Date", description: "Description", amount: "Amount" },
        dateFormat: "YYYY-MM-DD",
        debitCreditConvention: "SIGNED_AMOUNT",
      },
      rawRows,
    });

    expect(statementImportRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ lineCount: 1, duplicateCount: 1 }),
      em,
    );
  });

  it("throws ValidationException for a malformed dateFormat", async () => {
    await expect(
      service.importLines(em, {
        accountId: "acc-1",
        fileId: "file-1",
        mappingTemplate: {
          columnMap: { date: "Date", description: "Description", amount: "Amount" },
          dateFormat: "NOT-A-FORMAT",
          debitCreditConvention: "SIGNED_AMOUNT",
        },
        rawRows: [{ Date: "2026-01-10", Description: "A", Amount: "10.00" }],
      }),
    ).rejects.toBeInstanceOf(ValidationException);
  });
});

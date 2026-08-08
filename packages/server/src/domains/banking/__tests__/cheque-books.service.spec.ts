import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { ChequeBooksService } from "../application/cheque-books.service";
import { BankAccountEntity } from "../domain/bank-account.entity";
import { BankChequeBookEntity } from "../domain/bank-cheque-book.entity";

describe("ChequeBooksService", () => {
  let chequeBookRepository: { create: jest.Mock; findByIdOrFail: jest.Mock; list: jest.Mock };
  let chequeLeafRepository: { create: jest.Mock };
  let bankAccountRepository: { findByIdOrFail: jest.Mock };
  let service: ChequeBooksService;
  const em = {} as EntityManager;

  beforeEach(() => {
    chequeBookRepository = {
      create: jest.fn(async (data) => ({ id: "book-1", ...data } as BankChequeBookEntity)),
      findByIdOrFail: jest.fn(),
      list: jest.fn(async () => []),
    };
    chequeLeafRepository = { create: jest.fn(async (data) => ({ id: `leaf-${data.leafNo}`, ...data })) };
    bankAccountRepository = { findByIdOrFail: jest.fn(async () => ({ id: "acc-1" } as BankAccountEntity)) };
    service = new ChequeBooksService(chequeBookRepository as never, chequeLeafRepository as never, bankAccountRepository as never);
  });

  it("rejects endLeaf < startLeaf", async () => {
    await expect(
      service.create(em, { accountId: "acc-1", prefix: "CHQ", startLeaf: 10, endLeaf: 5 }, "actor-1"),
    ).rejects.toBeInstanceOf(ValidationException);
  });

  it("creates one UNUSED leaf per leaf number in the range, inside one transaction", async () => {
    await service.create(em, { accountId: "acc-1", prefix: "CHQ", startLeaf: 100, endLeaf: 103 }, "actor-1");
    expect(chequeLeafRepository.create).toHaveBeenCalledTimes(4);
    const leafNumbers = chequeLeafRepository.create.mock.calls.map((call) => call[0].leafNo);
    expect(leafNumbers).toEqual([100, 101, 102, 103]);
    for (const call of chequeLeafRepository.create.mock.calls) {
      expect(call[0].status).toBe("UNUSED");
      expect(call[0].bookId).toBe("book-1");
    }
  });
});

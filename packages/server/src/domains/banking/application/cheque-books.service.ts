import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { BankChequeBookEntity } from "../domain/bank-cheque-book.entity";
import { BankAccountRepository } from "../infrastructure/bank-account.repository";
import { BankChequeBookRepository, ListBankChequeBooksFilter } from "../infrastructure/bank-cheque-book.repository";
import { BankChequeLeafRepository } from "../infrastructure/bank-cheque-leaf.repository";

export interface CreateChequeBookInput {
  accountId: string;
  prefix: string;
  startLeaf: number;
  endLeaf: number;
}

/** FR-BANK-005.1 — registers a cheque book (leaf-number range) and auto-generates one `bank_cheque_leaf` row per leaf number in the range, all `status='UNUSED'`, inside one transaction (the caller's own `em`). */
@Injectable()
export class ChequeBooksService {
  constructor(
    private readonly chequeBookRepository: BankChequeBookRepository,
    private readonly chequeLeafRepository: BankChequeLeafRepository,
    private readonly bankAccountRepository: BankAccountRepository,
  ) {}

  async create(em: EntityManager, input: CreateChequeBookInput, actorId: string | null): Promise<BankChequeBookEntity> {
    if (input.endLeaf < input.startLeaf) {
      throw new ValidationException("ck_bank_cheque_book_leaf_range: end_leaf must be >= start_leaf");
    }
    await this.bankAccountRepository.findByIdOrFail(input.accountId, em);

    const book = await this.chequeBookRepository.create(
      {
        accountId: input.accountId,
        prefix: input.prefix,
        startLeaf: input.startLeaf,
        endLeaf: input.endLeaf,
        createdBy: actorId,
        updatedBy: actorId,
      },
      em,
    );

    for (let leafNo = input.startLeaf; leafNo <= input.endLeaf; leafNo++) {
      await this.chequeLeafRepository.create(
        {
          bookId: book.id,
          leafNo,
          status: "UNUSED",
          voucherId: null,
          payee: null,
          amount: null,
          issuedOn: null,
          statusReason: null,
          createdBy: actorId,
          updatedBy: actorId,
        },
        em,
      );
    }

    return book;
  }

  async findByIdOrFail(id: string): Promise<BankChequeBookEntity> {
    return this.chequeBookRepository.findByIdOrFail(id);
  }

  async list(filter: ListBankChequeBooksFilter = {}): Promise<BankChequeBookEntity[]> {
    return this.chequeBookRepository.list(filter);
  }
}

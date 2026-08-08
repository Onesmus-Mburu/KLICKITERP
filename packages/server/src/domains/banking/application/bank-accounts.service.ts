import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { GlAccountRepository } from "../../../accounting";
import { BankAccountEntity, BankAccountKind } from "../domain/bank-account.entity";
import { BankAccountRepository, ListBankAccountsFilter } from "../infrastructure/bank-account.repository";

export interface CreateBankAccountInput {
  name: string;
  kind: BankAccountKind;
  bankName?: string | null;
  branch?: string | null;
  accountNo?: string | null;
  glAccountId: string;
}

export interface UpdateBankAccountInput {
  name?: string;
  bankName?: string | null;
  branch?: string | null;
  accountNo?: string | null;
  isActive?: boolean;
}

/**
 * CRUD for `bank_account` (BR-BANK-01's own 1:1 `gl_account_id` UQ — one
 * `bank_account` row per GL account, both marker's own doc comments). Every
 * `deposits.service.ts`/`withdrawals.service.ts`/`bank-transfers.service.ts`/
 * `reconciliation.service.ts`/`cheque-books.service.ts` call resolves the
 * accounts they operate on through `BankAccountRepository` directly (a plain
 * lookup, not this service) — this service is the CRUD/config surface only.
 */
@Injectable()
export class BankAccountsService {
  constructor(
    private readonly bankAccountRepository: BankAccountRepository,
    private readonly glAccountRepository: GlAccountRepository,
  ) {}

  async create(
    input: CreateBankAccountInput,
    actorId: string | null,
    em?: EntityManager,
  ): Promise<BankAccountEntity> {
    const glAccount = await this.glAccountRepository.findByIdOrFail(input.glAccountId, em);
    if (!glAccount.isActive || !glAccount.isPostable) {
      throw new ValidationException(
        `gl_account ${input.glAccountId} must be active and postable to back a bank_account`,
      );
    }

    try {
      return await this.bankAccountRepository.create(
        {
          name: input.name,
          kind: input.kind,
          bankName: input.bankName ?? null,
          branch: input.branch ?? null,
          accountNo: input.accountNo ?? null,
          glAccountId: input.glAccountId,
          isActive: true,
          createdBy: actorId,
          updatedBy: actorId,
        },
        em,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `A bank_account already exists named "${input.name}" or backed by gl_account ${input.glAccountId} ` +
            "(uq_bank_account_name / uq_bank_account_gl_account_id)",
        );
      }
      throw error;
    }
  }

  async findByIdOrFail(id: string): Promise<BankAccountEntity> {
    return this.bankAccountRepository.findByIdOrFail(id);
  }

  async list(filter: ListBankAccountsFilter = {}): Promise<BankAccountEntity[]> {
    return this.bankAccountRepository.list(filter);
  }

  async update(id: string, changes: UpdateBankAccountInput, actorId: string | null): Promise<BankAccountEntity> {
    const account = await this.bankAccountRepository.findByIdOrFail(id);
    if (changes.name !== undefined) account.name = changes.name;
    if (changes.bankName !== undefined) account.bankName = changes.bankName;
    if (changes.branch !== undefined) account.branch = changes.branch;
    if (changes.accountNo !== undefined) account.accountNo = changes.accountNo;
    if (changes.isActive !== undefined) account.isActive = changes.isActive;
    account.updatedBy = actorId;

    try {
      return await this.bankAccountRepository.save(account);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`A bank_account already exists named "${account.name}" (uq_bank_account_name)`);
      }
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string; driverError?: { code?: string } })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === "23505";
}

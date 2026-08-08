import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { GlAccountEntity } from "../../../accounting";
import { WithdrawalsService, BANK_WITHDRAWALS_APPROVAL_DOMAIN_CODE } from "../application/withdrawals.service";
import { BankAccountEntity } from "../domain/bank-account.entity";
import { BankWithdrawalEntity } from "../domain/bank-withdrawal.entity";

function makeBankAccount(overrides: Partial<BankAccountEntity> = {}): BankAccountEntity {
  return { id: "acc-1", name: "Main Bank", kind: "BANK", glAccountId: "gl-acc-1", isActive: true, ...overrides } as BankAccountEntity;
}

function makeWithdrawal(overrides: Partial<BankWithdrawalEntity> = {}): BankWithdrawalEntity {
  return {
    id: "withdrawal-1",
    number: "DRAFT-withdrawal-1",
    accountId: "acc-1",
    amount: Money.fromInt(300),
    slipRef: null,
    sourceSessionId: null,
    status: "DRAFT",
    approvalRef: null,
    journalId: null,
    ackBySender: null,
    ackBySenderAt: null,
    ackByReceiver: null,
    ackByReceiverAt: null,
    ...overrides,
  } as BankWithdrawalEntity;
}

function makeUndepositedFundsAccount(): GlAccountEntity {
  return { id: "undeposited-acc", code: "1700", isActive: true, isPostable: true, controlDomain: null } as GlAccountEntity;
}

describe("WithdrawalsService", () => {
  let withdrawalRepository: { findByIdOrFail: jest.Mock; create: jest.Mock; save: jest.Mock; list: jest.Mock };
  let bankAccountRepository: { findByIdOrFail: jest.Mock };
  let glAccountRepository: { findByCodeOrFail: jest.Mock };
  let postingService: { post: jest.Mock };
  let numberingService: { allocate: jest.Mock };
  let approvalEngine: { submit: jest.Mock };
  let service: WithdrawalsService;

  const em = {} as EntityManager;

  beforeEach(() => {
    withdrawalRepository = {
      findByIdOrFail: jest.fn(async () => makeWithdrawal()),
      create: jest.fn(async (data) => makeWithdrawal(data)),
      save: jest.fn(async (e) => e),
      list: jest.fn(async () => []),
    };
    bankAccountRepository = { findByIdOrFail: jest.fn(async () => makeBankAccount()) };
    glAccountRepository = { findByCodeOrFail: jest.fn(async () => makeUndepositedFundsAccount()) };
    postingService = { post: jest.fn(async () => ({ id: "journal-1", lines: [] })) };
    numberingService = { allocate: jest.fn(async () => "BWD-000001") };
    approvalEngine = { submit: jest.fn(async () => ({ id: "approval-1" })) };

    service = new WithdrawalsService(
      withdrawalRepository as never,
      bankAccountRepository as never,
      glAccountRepository as never,
      postingService as never,
      numberingService as never,
      approvalEngine as never,
    );
  });

  it("create() rejects a non-positive amount", async () => {
    await expect(service.create(em, { accountId: "acc-1", amount: Money.ZERO }, "actor-1")).rejects.toBeInstanceOf(ValidationException);
  });

  it("submitForApproval() submits under BANK_WITHDRAWALS domain code", async () => {
    withdrawalRepository.findByIdOrFail.mockResolvedValue(makeWithdrawal({ status: "DRAFT" }));
    await service.submitForApproval(em, "withdrawal-1", "initiator-1");
    expect(approvalEngine.submit).toHaveBeenCalledWith(
      em,
      expect.objectContaining({ domainCode: BANK_WITHDRAWALS_APPROVAL_DOMAIN_CODE, entityType: "bank_withdrawal" }),
    );
  });

  describe("post() — posting direction (debit Undeposited Funds, credit source bank account — the mirror of DepositsService)", () => {
    beforeEach(() => {
      withdrawalRepository.findByIdOrFail.mockResolvedValue(makeWithdrawal({ status: "APPROVED", amount: Money.fromInt(300) }));
    });

    it("rejects a non-APPROVED withdrawal", async () => {
      withdrawalRepository.findByIdOrFail.mockResolvedValue(makeWithdrawal({ status: "DRAFT" }));
      await expect(service.post(em, "withdrawal-1", "poster-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("debits Undeposited Funds, credits the source bank account's own gl_account_id", async () => {
      await service.post(em, "withdrawal-1", "poster-1");
      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: "undeposited-acc", debit: Money.fromInt(300), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "gl-acc-1", debit: Money.ZERO, credit: Money.fromInt(300) }),
          ],
        }),
      );
    });

    it("allocates the real BANK_WITHDRAWAL number and sets status=POSTED", async () => {
      const result = await service.post(em, "withdrawal-1", "poster-1");
      expect(numberingService.allocate).toHaveBeenCalledWith(em, "BANK_WITHDRAWAL");
      expect(result.status).toBe("POSTED");
      expect(result.journalId).toBe("journal-1");
    });
  });
});

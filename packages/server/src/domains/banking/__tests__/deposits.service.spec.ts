import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { GlAccountEntity } from "../../../accounting";
import { DepositsService, BANK_DEPOSITS_APPROVAL_DOMAIN_CODE } from "../application/deposits.service";
import { BankAccountEntity } from "../domain/bank-account.entity";
import { BankDepositEntity } from "../domain/bank-deposit.entity";

function makeBankAccount(overrides: Partial<BankAccountEntity> = {}): BankAccountEntity {
  return { id: "acc-1", name: "Main Bank", kind: "BANK", glAccountId: "gl-acc-1", isActive: true, ...overrides } as BankAccountEntity;
}

function makeDeposit(overrides: Partial<BankDepositEntity> = {}): BankDepositEntity {
  return {
    id: "deposit-1",
    number: "DRAFT-deposit-1",
    accountId: "acc-1",
    amount: Money.fromInt(500),
    slipRef: "SLIP-001",
    sourceSessionId: null,
    status: "DRAFT",
    approvalRef: null,
    journalId: null,
    ackBySender: null,
    ackBySenderAt: null,
    ackByReceiver: null,
    ackByReceiverAt: null,
    ...overrides,
  } as BankDepositEntity;
}

function makeUndepositedFundsAccount(): GlAccountEntity {
  return { id: "undeposited-acc", code: "1700", isActive: true, isPostable: true, controlDomain: null } as GlAccountEntity;
}

describe("DepositsService", () => {
  let depositRepository: { findByIdOrFail: jest.Mock; create: jest.Mock; save: jest.Mock; list: jest.Mock };
  let bankAccountRepository: { findByIdOrFail: jest.Mock };
  let glAccountRepository: { findByCodeOrFail: jest.Mock };
  let postingService: { post: jest.Mock };
  let numberingService: { allocate: jest.Mock };
  let approvalEngine: { submit: jest.Mock };
  let service: DepositsService;

  const em = {} as EntityManager;

  beforeEach(() => {
    depositRepository = {
      findByIdOrFail: jest.fn(async () => makeDeposit()),
      create: jest.fn(async (data) => makeDeposit(data)),
      save: jest.fn(async (e) => e),
      list: jest.fn(async () => []),
    };
    bankAccountRepository = { findByIdOrFail: jest.fn(async () => makeBankAccount()) };
    glAccountRepository = { findByCodeOrFail: jest.fn(async () => makeUndepositedFundsAccount()) };
    postingService = { post: jest.fn(async () => ({ id: "journal-1", lines: [] })) };
    numberingService = { allocate: jest.fn(async () => "BDP-000001") };
    approvalEngine = { submit: jest.fn(async () => ({ id: "approval-1" })) };

    service = new DepositsService(
      depositRepository as never,
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

  it("submitForApproval() submits under BANK_DEPOSITS domain code", async () => {
    depositRepository.findByIdOrFail.mockResolvedValue(makeDeposit({ status: "DRAFT" }));
    await service.submitForApproval(em, "deposit-1", "initiator-1");
    expect(approvalEngine.submit).toHaveBeenCalledWith(
      em,
      expect.objectContaining({ domainCode: BANK_DEPOSITS_APPROVAL_DOMAIN_CODE, entityType: "bank_deposit" }),
    );
  });

  describe("post() — posting direction (debit destination bank account, credit Undeposited Funds)", () => {
    beforeEach(() => {
      depositRepository.findByIdOrFail.mockResolvedValue(makeDeposit({ status: "APPROVED", amount: Money.fromInt(500) }));
    });

    it("rejects a non-APPROVED deposit", async () => {
      depositRepository.findByIdOrFail.mockResolvedValue(makeDeposit({ status: "DRAFT" }));
      await expect(service.post(em, "deposit-1", "poster-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("debits the bank account's own gl_account_id, credits Undeposited Funds", async () => {
      await service.post(em, "deposit-1", "poster-1");
      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: "gl-acc-1", debit: Money.fromInt(500), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "undeposited-acc", debit: Money.ZERO, credit: Money.fromInt(500) }),
          ],
        }),
      );
    });

    it("allocates the real BANK_DEPOSIT number and sets status=POSTED", async () => {
      const result = await service.post(em, "deposit-1", "poster-1");
      expect(numberingService.allocate).toHaveBeenCalledWith(em, "BANK_DEPOSIT");
      expect(result.status).toBe("POSTED");
      expect(result.journalId).toBe("journal-1");
    });
  });

  describe("dual acknowledgment (FR-BANK-007)", () => {
    it("acknowledgeBySender() stamps ackBySender/ackBySenderAt", async () => {
      depositRepository.findByIdOrFail.mockResolvedValue(makeDeposit());
      const result = await service.acknowledgeBySender("deposit-1", "sender-1");
      expect(result.ackBySender).toBe("sender-1");
      expect(result.ackBySenderAt).toBeInstanceOf(Date);
    });

    it("acknowledgeByReceiver() stamps ackByReceiver/ackByReceiverAt", async () => {
      depositRepository.findByIdOrFail.mockResolvedValue(makeDeposit());
      const result = await service.acknowledgeByReceiver("deposit-1", "receiver-1");
      expect(result.ackByReceiver).toBe("receiver-1");
      expect(result.ackByReceiverAt).toBeInstanceOf(Date);
    });
  });
});

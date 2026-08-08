import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { GlAccountEntity } from "../../../accounting";
import { BankTransfersService, BANK_TRANSFERS_APPROVAL_DOMAIN_CODE } from "../application/bank-transfers.service";
import { BankAccountEntity } from "../domain/bank-account.entity";
import { BankTransferEntity } from "../domain/bank-transfer.entity";

function makeBankAccount(overrides: Partial<BankAccountEntity> = {}): BankAccountEntity {
  return {
    id: "from-acc",
    name: "Source Bank",
    kind: "BANK",
    glAccountId: "gl-from",
    isActive: true,
    ...overrides,
  } as BankAccountEntity;
}

function makeTransfer(overrides: Partial<BankTransferEntity> = {}): BankTransferEntity {
  return {
    id: "transfer-1",
    number: "DRAFT-transfer-1",
    fromAccountId: "from-acc",
    toAccountId: "to-acc",
    amount: Money.fromInt(1000),
    status: "DRAFT",
    approvalRef: null,
    journalId: null,
    ...overrides,
  } as BankTransferEntity;
}

function makeGlAccount(overrides: Partial<GlAccountEntity> = {}): GlAccountEntity {
  return { id: "clearing-acc", code: "1500", isActive: true, isPostable: true, controlDomain: "TRANSFER_CLEARING", ...overrides } as GlAccountEntity;
}

describe("BankTransfersService", () => {
  let transferRepository: { findByIdOrFail: jest.Mock; create: jest.Mock; save: jest.Mock; list: jest.Mock };
  let bankAccountRepository: { findByIdOrFail: jest.Mock };
  let glAccountRepository: { findByControlDomain: jest.Mock };
  let postingService: { post: jest.Mock };
  let numberingService: { allocate: jest.Mock };
  let approvalEngine: { submit: jest.Mock };
  let service: BankTransfersService;

  const em = {} as EntityManager;

  beforeEach(() => {
    transferRepository = {
      findByIdOrFail: jest.fn(async () => makeTransfer()),
      create: jest.fn(async (data) => makeTransfer(data)),
      save: jest.fn(async (e) => e),
      list: jest.fn(async () => []),
    };
    bankAccountRepository = {
      findByIdOrFail: jest.fn(async (id: string) => {
        if (id === "from-acc") return makeBankAccount({ id: "from-acc", name: "Source Bank", glAccountId: "gl-from" });
        if (id === "to-acc") return makeBankAccount({ id: "to-acc", name: "Dest Bank", glAccountId: "gl-to" });
        return makeBankAccount({ id });
      }),
    };
    glAccountRepository = { findByControlDomain: jest.fn(async () => [makeGlAccount()]) };
    postingService = { post: jest.fn(async () => ({ id: "journal-1", lines: [] })) };
    numberingService = { allocate: jest.fn(async () => "BTR-000001") };
    approvalEngine = { submit: jest.fn(async () => ({ id: "approval-1" })) };

    service = new BankTransfersService(
      transferRepository as never,
      bankAccountRepository as never,
      glAccountRepository as never,
      postingService as never,
      numberingService as never,
      approvalEngine as never,
    );
  });

  describe("create()", () => {
    it("rejects a non-positive amount", async () => {
      await expect(service.create(em, { fromAccountId: "from-acc", toAccountId: "to-acc", amount: Money.ZERO }, "actor-1")).rejects.toBeInstanceOf(
        ValidationException,
      );
    });

    it("rejects fromAccountId === toAccountId (defense-in-depth ahead of the DB CHECK)", async () => {
      await expect(
        service.create(em, { fromAccountId: "same-acc", toAccountId: "same-acc", amount: Money.fromInt(100) }, "actor-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("creates a DRAFT transfer with a placeholder number", async () => {
      const result = await service.create(em, { fromAccountId: "from-acc", toAccountId: "to-acc", amount: Money.fromInt(1000) }, "actor-1");
      expect(result.status).toBe("DRAFT");
      expect(result.number).toMatch(/^DRAFT-/);
    });
  });

  describe("submitForApproval()", () => {
    it("submits under BANK_TRANSFERS domain code", async () => {
      transferRepository.findByIdOrFail.mockResolvedValue(makeTransfer({ status: "DRAFT" }));
      const result = await service.submitForApproval(em, "transfer-1", "initiator-1");
      expect(approvalEngine.submit).toHaveBeenCalledWith(
        em,
        expect.objectContaining({ domainCode: BANK_TRANSFERS_APPROVAL_DOMAIN_CODE, entityType: "bank_transfer", entityId: "transfer-1" }),
      );
      expect(result.status).toBe("PENDING_APPROVAL");
    });

    it("rejects a non-DRAFT transfer", async () => {
      transferRepository.findByIdOrFail.mockResolvedValue(makeTransfer({ status: "APPROVED" }));
      await expect(service.submitForApproval(em, "transfer-1", "initiator-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("onApprovalDecided()", () => {
    it("approved -> APPROVED", async () => {
      transferRepository.findByIdOrFail.mockResolvedValue(makeTransfer({ status: "PENDING_APPROVAL" }));
      const result = await service.onApprovalDecided(em, "transfer-1", true, "actor-1");
      expect(result.status).toBe("APPROVED");
    });

    it("rejected -> reverts to DRAFT (no dedicated REJECTED status)", async () => {
      transferRepository.findByIdOrFail.mockResolvedValue(makeTransfer({ status: "PENDING_APPROVAL", approvalRef: "approval-1" }));
      const result = await service.onApprovalDecided(em, "transfer-1", false, "actor-1");
      expect(result.status).toBe("DRAFT");
      expect(result.approvalRef).toBeNull();
    });
  });

  describe("post() — P-32 exact 2-leg TRANSFER_CLEARING assertions", () => {
    beforeEach(() => {
      transferRepository.findByIdOrFail.mockResolvedValue(makeTransfer({ status: "APPROVED", amount: Money.fromInt(1000) }));
    });

    it("rejects a non-APPROVED transfer", async () => {
      transferRepository.findByIdOrFail.mockResolvedValue(makeTransfer({ status: "DRAFT" }));
      await expect(service.post(em, "transfer-1", "poster-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("posts ONE balanced journal with the clearing account debited AND credited, source/destination correctly signed", async () => {
      await service.post(em, "transfer-1", "poster-1");
      expect(postingService.post).toHaveBeenCalledTimes(1);
      const draft = postingService.post.mock.calls[0][1];
      expect(draft.lines).toHaveLength(4);

      const [leg1Clearing, sourceLine, destLine, leg2Clearing] = draft.lines;
      // Leg 1: debit clearing, credit source account's own gl_account_id.
      expect(leg1Clearing).toEqual(expect.objectContaining({ accountId: "clearing-acc", debit: Money.fromInt(1000), credit: Money.ZERO }));
      expect(sourceLine).toEqual(expect.objectContaining({ accountId: "gl-from", debit: Money.ZERO, credit: Money.fromInt(1000) }));
      // Leg 2: debit destination account's own gl_account_id, credit clearing.
      expect(destLine).toEqual(expect.objectContaining({ accountId: "gl-to", debit: Money.fromInt(1000), credit: Money.ZERO }));
      expect(leg2Clearing).toEqual(expect.objectContaining({ accountId: "clearing-acc", debit: Money.ZERO, credit: Money.fromInt(1000) }));

      // The two clearing lines net to zero (BR-BANK-01).
      const clearingNet = leg1Clearing.debit.subtract(leg1Clearing.credit).add(leg2Clearing.debit.subtract(leg2Clearing.credit));
      expect(clearingNet.isZero()).toBe(true);

      // The whole journal is balanced.
      const totalDebit = draft.lines.reduce((sum: Money, l: { debit: Money }) => sum.add(l.debit), Money.ZERO);
      const totalCredit = draft.lines.reduce((sum: Money, l: { credit: Money }) => sum.add(l.credit), Money.ZERO);
      expect(totalDebit.equals(totalCredit)).toBe(true);
    });

    it("allocates the real BANK_TRANSFER number, sets status=POSTED, and stamps journal_id", async () => {
      const result = await service.post(em, "transfer-1", "poster-1");
      expect(numberingService.allocate).toHaveBeenCalledWith(em, "BANK_TRANSFER");
      expect(result.number).toBe("BTR-000001");
      expect(result.status).toBe("POSTED");
      expect(result.journalId).toBe("journal-1");
    });
  });
});

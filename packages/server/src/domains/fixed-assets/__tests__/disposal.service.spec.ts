import { EntityManager } from "typeorm";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { GlAccountEntity } from "../../../accounting";
import { DisposalService } from "../application/disposal.service";
import { FaAssetEntity } from "../domain/fa-asset.entity";
import { FaCategoryEntity } from "../domain/fa-category.entity";
import { FaDisposalEntity } from "../domain/fa-disposal.entity";
import {
  DISPOSAL_PROCEEDS_ACCOUNT_CODE,
  GAIN_ON_DISPOSAL_ACCOUNT_CODE,
  LOSS_ON_DISPOSAL_ACCOUNT_CODE,
} from "../application/gl-disposal-accounts.util";

function makeAsset(overrides: Partial<FaAssetEntity> = {}): FaAssetEntity {
  return {
    id: "asset-1",
    code: "AST-0001",
    categoryId: "cat-1",
    cost: Money.fromDecimalString("10000.00"),
    accumDepreciation: Money.fromDecimalString("6000.00"),
    status: "ACTIVE",
    ...overrides,
  } as FaAssetEntity;
}

function makeCategory(overrides: Partial<FaCategoryEntity> = {}): FaCategoryEntity {
  return {
    id: "cat-1",
    glCostAccountId: "cost-acc",
    glAccumDepAccountId: "accumdep-acc",
    glDepExpenseAccountId: "depexp-acc",
    ...overrides,
  } as FaCategoryEntity;
}

function makeDisposal(overrides: Partial<FaDisposalEntity> = {}): FaDisposalEntity {
  return {
    id: "disp-1",
    assetId: "asset-1",
    method: "SALE",
    proceeds: Money.ZERO,
    gainLoss: null,
    status: "DRAFT",
    approvalRef: null,
    journalId: null,
    ...overrides,
  } as FaDisposalEntity;
}

function makeAccount(id: string, code: string): GlAccountEntity {
  return { id, code } as GlAccountEntity;
}

describe("DisposalService", () => {
  let disposalRepository: { create: jest.Mock; save: jest.Mock; findByIdOrFail: jest.Mock; list: jest.Mock };
  let assetRepository: { findByIdOrFail: jest.Mock; save: jest.Mock };
  let categoryRepository: { findByIdOrFail: jest.Mock };
  let glAccountRepository: { findByCodeOrFail: jest.Mock };
  let postingService: { post: jest.Mock };
  let approvalEngine: { submit: jest.Mock };
  let service: DisposalService;

  const em = {} as EntityManager;

  beforeEach(() => {
    disposalRepository = {
      create: jest.fn(async (data) => makeDisposal(data)),
      save: jest.fn(async (e) => e),
      findByIdOrFail: jest.fn(async () => makeDisposal()),
      list: jest.fn(async () => []),
    };
    assetRepository = {
      findByIdOrFail: jest.fn(async () => makeAsset()),
      save: jest.fn(async (e) => e),
    };
    categoryRepository = { findByIdOrFail: jest.fn(async () => makeCategory()) };
    glAccountRepository = {
      findByCodeOrFail: jest.fn(async (code: string) => {
        if (code === DISPOSAL_PROCEEDS_ACCOUNT_CODE) return makeAccount("proceeds-acc", code);
        if (code === GAIN_ON_DISPOSAL_ACCOUNT_CODE) return makeAccount("gain-acc", code);
        if (code === LOSS_ON_DISPOSAL_ACCOUNT_CODE) return makeAccount("loss-acc", code);
        throw new Error(`unexpected code ${code}`);
      }),
    };
    postingService = { post: jest.fn(async () => ({ id: "journal-1", lines: [] })) };
    approvalEngine = { submit: jest.fn(async () => ({ id: "instance-1" })) };

    service = new DisposalService(
      disposalRepository as never,
      assetRepository as never,
      categoryRepository as never,
      glAccountRepository as never,
      postingService as never,
      approvalEngine as never,
    );
  });

  describe("create", () => {
    it("computes gain_loss = proceeds - NBV — a GAIN scenario (proceeds > NBV)", async () => {
      // NBV = 10000 - 6000 = 4000; proceeds = 5000 => gain = 1000
      assetRepository.findByIdOrFail.mockResolvedValue(makeAsset());
      await service.create(em, { assetId: "asset-1", method: "SALE", proceeds: Money.fromDecimalString("5000.00") }, "user-1");
      expect(disposalRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ proceeds: Money.fromDecimalString("5000.00"), gainLoss: Money.fromDecimalString("1000.00") }),
        em,
      );
    });

    it("computes gain_loss = proceeds - NBV — a LOSS scenario (proceeds < NBV)", async () => {
      // NBV = 4000; proceeds = 1500 => loss = -2500
      assetRepository.findByIdOrFail.mockResolvedValue(makeAsset());
      await service.create(em, { assetId: "asset-1", method: "SALE", proceeds: Money.fromDecimalString("1500.00") }, "user-1");
      expect(disposalRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ proceeds: Money.fromDecimalString("1500.00"), gainLoss: Money.fromDecimalString("-2500.00") }),
        em,
      );
    });

    it("defaults proceeds to zero for WRITE_OFF (a full loss of the remaining NBV)", async () => {
      assetRepository.findByIdOrFail.mockResolvedValue(makeAsset());
      await service.create(em, { assetId: "asset-1", method: "WRITE_OFF" }, "user-1");
      expect(disposalRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ proceeds: Money.ZERO, gainLoss: Money.fromDecimalString("-4000.00") }),
        em,
      );
    });

    it("translates a unique-violation on uq_fa_disposal_asset_id into ConflictException", async () => {
      disposalRepository.create.mockRejectedValue({ code: "23505" });
      await expect(service.create(em, { assetId: "asset-1", method: "SALE" }, "user-1")).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("submitForApproval", () => {
    it("uses proceeds as the amount when proceeds > 0", async () => {
      disposalRepository.findByIdOrFail.mockResolvedValue(
        makeDisposal({ status: "DRAFT", proceeds: Money.fromDecimalString("5000.00"), gainLoss: Money.fromDecimalString("1000.00") }),
      );
      await service.submitForApproval(em, "disp-1", "user-1");
      expect(approvalEngine.submit).toHaveBeenCalledWith(
        em,
        expect.objectContaining({ domainCode: "ASSET_DISPOSALS", amount: Money.fromDecimalString("5000.00") }),
      );
    });

    it("uses |gain_loss| as the amount when proceeds = 0 (WRITE_OFF/DONATION)", async () => {
      disposalRepository.findByIdOrFail.mockResolvedValue(
        makeDisposal({ status: "DRAFT", proceeds: Money.ZERO, gainLoss: Money.fromDecimalString("-4000.00"), method: "WRITE_OFF" }),
      );
      await service.submitForApproval(em, "disp-1", "user-1");
      expect(approvalEngine.submit).toHaveBeenCalledWith(
        em,
        expect.objectContaining({ amount: Money.fromDecimalString("4000.00") }),
      );
    });
  });

  describe("post", () => {
    it("rejects a non-APPROVED disposal", async () => {
      disposalRepository.findByIdOrFail.mockResolvedValue(makeDisposal({ status: "PENDING_APPROVAL" }));
      await expect(service.post(em, "disp-1", "poster-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("P-31 GAIN: debit proceeds + accum_dep, credit gain + full cost", async () => {
      // proceeds=5000, accumDep=6000, cost=10000, gainLoss=+1000
      disposalRepository.findByIdOrFail.mockResolvedValue(
        makeDisposal({ status: "APPROVED", proceeds: Money.fromDecimalString("5000.00"), gainLoss: Money.fromDecimalString("1000.00") }),
      );

      await service.post(em, "disp-1", "poster-1");

      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: "proceeds-acc", debit: Money.fromDecimalString("5000.00"), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "accumdep-acc", debit: Money.fromDecimalString("6000.00"), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "gain-acc", debit: Money.ZERO, credit: Money.fromDecimalString("1000.00") }),
            expect.objectContaining({ accountId: "cost-acc", debit: Money.ZERO, credit: Money.fromDecimalString("10000.00") }),
          ],
        }),
      );
      // Balanced: debit 5000+6000=11000, credit 1000+10000=11000.
    });

    it("P-31 LOSS: debit proceeds + accum_dep + loss, credit full cost", async () => {
      // proceeds=1500, accumDep=6000, cost=10000, gainLoss=-2500
      disposalRepository.findByIdOrFail.mockResolvedValue(
        makeDisposal({ status: "APPROVED", proceeds: Money.fromDecimalString("1500.00"), gainLoss: Money.fromDecimalString("-2500.00") }),
      );

      await service.post(em, "disp-1", "poster-1");

      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: "proceeds-acc", debit: Money.fromDecimalString("1500.00"), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "accumdep-acc", debit: Money.fromDecimalString("6000.00"), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "loss-acc", debit: Money.fromDecimalString("2500.00"), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "cost-acc", debit: Money.ZERO, credit: Money.fromDecimalString("10000.00") }),
          ],
        }),
      );
      // Balanced: debit 1500+6000+2500=10000, credit 10000.
    });

    it("zero-proceeds WRITE_OFF: skips the cash line entirely (never posts a zero-amount line)", async () => {
      // proceeds=0, accumDep=6000, cost=10000, gainLoss=-4000 (full remaining NBV write-off)
      disposalRepository.findByIdOrFail.mockResolvedValue(
        makeDisposal({ status: "APPROVED", method: "WRITE_OFF", proceeds: Money.ZERO, gainLoss: Money.fromDecimalString("-4000.00") }),
      );

      await service.post(em, "disp-1", "poster-1");

      const call = postingService.post.mock.calls[0][1];
      expect(call.lines).toHaveLength(3); // NO proceeds line
      expect(call.lines.find((l: { accountId: string }) => l.accountId === "proceeds-acc")).toBeUndefined();
      expect(call.lines).toEqual([
        expect.objectContaining({ accountId: "accumdep-acc", debit: Money.fromDecimalString("6000.00"), credit: Money.ZERO }),
        expect.objectContaining({ accountId: "loss-acc", debit: Money.fromDecimalString("4000.00"), credit: Money.ZERO }),
        expect.objectContaining({ accountId: "cost-acc", debit: Money.ZERO, credit: Money.fromDecimalString("10000.00") }),
      ]);
      // Balanced: debit 6000+4000=10000, credit 10000.
    });

    it("sets fa_asset.status='DISPOSED' and disposal.status='POSTED'/journal_id", async () => {
      disposalRepository.findByIdOrFail.mockResolvedValue(
        makeDisposal({ status: "APPROVED", proceeds: Money.fromDecimalString("5000.00"), gainLoss: Money.fromDecimalString("1000.00") }),
      );

      const result = await service.post(em, "disp-1", "poster-1");

      expect(assetRepository.save).toHaveBeenCalledWith(expect.objectContaining({ status: "DISPOSED" }), em);
      expect(result.status).toBe("POSTED");
      expect(result.journalId).toBe("journal-1");
    });
  });
});

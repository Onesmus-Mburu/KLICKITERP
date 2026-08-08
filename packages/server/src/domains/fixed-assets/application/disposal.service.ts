import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { GlAccountRepository, PostingService, PostJournalLineDraft } from "../../../accounting";
import { ApprovalEngineService } from "../../../platform/approvals";
import { FaDisposalEntity, FaDisposalMethod } from "../domain/fa-disposal.entity";
import { FaDisposalRepository, ListFaDisposalsFilter } from "../infrastructure/fa-disposal.repository";
import { FaAssetRepository } from "../infrastructure/fa-asset.repository";
import { FaCategoryRepository } from "../infrastructure/fa-category.repository";
import {
  resolveDisposalProceedsAccount,
  resolveGainOnDisposalAccount,
  resolveLossOnDisposalAccount,
} from "./gl-disposal-accounts.util";

/** `appr_workflow_def.domain_code` disposals submit under — the `0900` seed registers a single-level System-Admin workflow under this code (`seedSingleLevelWorkflow()`). */
export const ASSET_DISPOSALS_APPROVAL_DOMAIN_CODE = "ASSET_DISPOSALS";

/** Postgres unique_violation SQLSTATE — see `NumberingService.allocate()` for the same pattern. */
const PG_UNIQUE_VIOLATION = "23505";

export interface CreateFaDisposalInput {
  assetId: string;
  method: FaDisposalMethod;
  /** Omitted/zero for DONATION/WRITE_OFF and no-cash SCRAP. */
  proceeds?: Money;
}

/**
 * THE disposal wizard (FR-FA-005.1): pick asset -> method -> proceeds ->
 * compute gain/loss -> `ASSET_DISPOSALS` approval -> P-31 -> `fa_asset.status
 * = 'DISPOSED'` (retained permanently per BR-FA-02, the record is never
 * deleted).
 */
@Injectable()
export class DisposalService {
  constructor(
    private readonly disposalRepository: FaDisposalRepository,
    private readonly assetRepository: FaAssetRepository,
    private readonly categoryRepository: FaCategoryRepository,
    private readonly glAccountRepository: GlAccountRepository,
    private readonly postingService: PostingService,
    private readonly approvalEngine: ApprovalEngineService,
  ) {}

  /**
   * `gain_loss = proceeds - NBV`, `NBV = cost - accum_depreciation`
   * (FR-FA-005.1), computed and frozen at creation time. `status='DRAFT'`.
   * BR-FA-02's trigger blocks this on an already-disposed asset at the DB
   * layer; `uq_fa_disposal_asset_id`'s violation is caught here and
   * translated to `ConflictException` (the "only one disposal per asset,
   * ever" backstop).
   */
  async create(em: EntityManager, input: CreateFaDisposalInput, initiatorId: string | null): Promise<FaDisposalEntity> {
    const asset = await this.assetRepository.findByIdOrFail(input.assetId, em);
    const proceeds = input.proceeds ?? Money.ZERO;
    if (proceeds.isNegative()) {
      throw new ValidationException("fa_disposal.proceeds cannot be negative");
    }
    const nbv = asset.cost.subtract(asset.accumDepreciation);
    const gainLoss = proceeds.subtract(nbv);

    try {
      return await this.disposalRepository.create(
        {
          assetId: input.assetId,
          method: input.method,
          proceeds,
          gainLoss,
          status: "DRAFT",
          approvalRef: null,
          journalId: null,
          createdBy: initiatorId,
          updatedBy: initiatorId,
        },
        em,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `Asset ${input.assetId} has already been disposed (uq_fa_disposal_asset_id — an asset can be disposed at most once, ever, per BR-FA-02)`,
        );
      }
      throw error;
    }
  }

  async findByIdOrFail(id: string): Promise<FaDisposalEntity> {
    return this.disposalRepository.findByIdOrFail(id);
  }

  async list(filter: ListFaDisposalsFilter = {}): Promise<FaDisposalEntity[]> {
    return this.disposalRepository.list(filter);
  }

  /**
   * **Approval `amount`** — documented judgement call: `proceeds` when
   * there's real cash involved (the size of the cash event is the natural
   * approval signal), or `|gain_loss|` when `proceeds=0` (DONATION/WRITE_OFF/
   * no-cash SCRAP — the approver should see the book-value impact rather
   * than a misleadingly-zero amount).
   */
  async submitForApproval(em: EntityManager, disposalId: string, initiatorId: string): Promise<FaDisposalEntity> {
    const disposal = await this.disposalRepository.findByIdOrFail(disposalId, em);
    if (disposal.status !== "DRAFT") {
      throw new ValidationException(
        `Only a DRAFT disposal can be submitted (disposal ${disposalId} status=${disposal.status})`,
      );
    }

    const gainLoss = disposal.gainLoss ?? Money.ZERO;
    const amount = disposal.proceeds.isPositive()
      ? disposal.proceeds
      : gainLoss.isNegative()
        ? gainLoss.negate()
        : gainLoss;

    const instance = await this.approvalEngine.submit(em, {
      domainCode: ASSET_DISPOSALS_APPROVAL_DOMAIN_CODE,
      entityType: "fa_disposal",
      entityId: disposal.id,
      amount,
      initiatorId,
    });

    disposal.status = "PENDING_APPROVAL";
    disposal.approvalRef = instance.id;
    disposal.updatedBy = initiatorId;
    return this.disposalRepository.save(disposal, em);
  }

  /**
   * Interim manual-trigger pattern (no dispatcher exists). Mirrors
   * `bank_transfer`'s own 4-value enum shape exactly
   * (`DRAFT|PENDING_APPROVAL|APPROVED|POSTED`) — reject reverts to `DRAFT`
   * (`approval_ref` cleared, so it can be corrected and resubmitted), approve
   * advances to the real `APPROVED` state.
   */
  async onApprovalDecided(
    em: EntityManager,
    disposalId: string,
    approved: boolean,
    actorId: string | null = null,
  ): Promise<FaDisposalEntity> {
    const disposal = await this.disposalRepository.findByIdOrFail(disposalId, em);
    if (disposal.status !== "PENDING_APPROVAL") {
      throw new ValidationException(`fa_disposal ${disposalId} is not PENDING_APPROVAL (status=${disposal.status})`);
    }
    disposal.status = approved ? "APPROVED" : "DRAFT";
    if (!approved) disposal.approvalRef = null;
    disposal.updatedBy = actorId;
    return this.disposalRepository.save(disposal, em);
  }

  /**
   * P-31 — requires `APPROVED`. Builds (in order, any zero-amount line
   * skipped — never posts a zero-amount line):
   *  - debit Cash/Bank for `proceeds` (skipped entirely when `proceeds=0`);
   *  - debit the category's `gl_accum_dep_account_id` for `accum_depreciation`
   *    (skipped if the asset was never depreciated);
   *  - debit "Loss on Disposal" for `|gain_loss|` when `gain_loss` is
   *    negative, OR credit "Gain on Disposal" for `gain_loss` when positive
   *    (never both — mutually exclusive by construction);
   *  - credit the category's `gl_cost_account_id` for the FULL `cost`,
   *    always.
   * This ALWAYS balances by construction: `gain_loss` is DEFINED as
   * `proceeds - (cost - accum_depreciation)`, so algebraically
   * `proceeds + accum_depreciation + max(0,-gain_loss) ≡ cost + max(0,gain_loss)`
   * identically, regardless of which lines end up skipped.
   */
  async post(em: EntityManager, disposalId: string, postedBy: string): Promise<FaDisposalEntity> {
    const disposal = await this.disposalRepository.findByIdOrFail(disposalId, em);
    if (disposal.status !== "APPROVED") {
      throw new ValidationException(
        `Only an APPROVED disposal can be posted (disposal ${disposalId} status=${disposal.status})`,
      );
    }

    const asset = await this.assetRepository.findByIdOrFail(disposal.assetId, em);
    const category = await this.categoryRepository.findByIdOrFail(asset.categoryId, em);
    const gainLoss = disposal.gainLoss ?? Money.ZERO;

    const journalLines: PostJournalLineDraft[] = [];

    if (disposal.proceeds.isPositive()) {
      const proceedsAccount = await resolveDisposalProceedsAccount(this.glAccountRepository, em);
      journalLines.push({
        accountId: proceedsAccount.id,
        debit: disposal.proceeds,
        credit: Money.ZERO,
        memo: `P-31 disposal proceeds (${disposal.method})`,
        entityRefType: "fa_disposal",
        entityRefId: disposal.id,
      });
    }

    if (asset.accumDepreciation.isPositive()) {
      journalLines.push({
        accountId: category.glAccumDepAccountId,
        debit: asset.accumDepreciation,
        credit: Money.ZERO,
        memo: "P-31 accumulated depreciation write-off",
        entityRefType: "fa_disposal",
        entityRefId: disposal.id,
      });
    }

    if (gainLoss.isNegative()) {
      const lossAccount = await resolveLossOnDisposalAccount(this.glAccountRepository, em);
      journalLines.push({
        accountId: lossAccount.id,
        debit: gainLoss.negate(),
        credit: Money.ZERO,
        memo: "P-31 loss on disposal",
        entityRefType: "fa_disposal",
        entityRefId: disposal.id,
      });
    } else if (gainLoss.isPositive()) {
      const gainAccount = await resolveGainOnDisposalAccount(this.glAccountRepository, em);
      journalLines.push({
        accountId: gainAccount.id,
        debit: Money.ZERO,
        credit: gainLoss,
        memo: "P-31 gain on disposal",
        entityRefType: "fa_disposal",
        entityRefId: disposal.id,
      });
    }

    journalLines.push({
      accountId: category.glCostAccountId,
      debit: Money.ZERO,
      credit: asset.cost,
      memo: "P-31 asset cost written off",
      entityRefType: "fa_disposal",
      entityRefId: disposal.id,
    });

    const journal = await this.postingService.post(em, {
      journalDate: new Date().toISOString().slice(0, 10),
      sourceModule: "fixed-assets",
      sourceDocType: "fa_disposal",
      sourceDocId: disposal.id,
      narration: `P-31 asset disposal (${disposal.method}) — ${asset.code}`,
      journalType: "MANUAL",
      postedBy,
      approvalRef: disposal.approvalRef ?? undefined,
      lines: journalLines,
    });

    asset.status = "DISPOSED";
    asset.updatedBy = postedBy;
    await this.assetRepository.save(asset, em);

    disposal.status = "POSTED";
    disposal.journalId = journal.id;
    disposal.updatedBy = postedBy;
    return this.disposalRepository.save(disposal, em);
  }
}

function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string; driverError?: { code?: string } })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === PG_UNIQUE_VIOLATION;
}

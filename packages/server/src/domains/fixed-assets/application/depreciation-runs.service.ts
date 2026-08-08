import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money, RoundingMode } from "../../../shared/money/money";
import { GlPeriodRepository, PostingService, PostJournalLineDraft } from "../../../accounting";
import { ApprovalEngineService } from "../../../platform/approvals";
import { FaAssetEntity } from "../domain/fa-asset.entity";
import { FaCategoryEntity } from "../domain/fa-category.entity";
import { FaDepreciationRunEntity } from "../domain/fa-depreciation-run.entity";
import { FaAssetRepository } from "../infrastructure/fa-asset.repository";
import { FaCategoryRepository } from "../infrastructure/fa-category.repository";
import { FaDepreciationLineEntity } from "../domain/fa-depreciation-line.entity";
import { FaDepreciationLineRepository } from "../infrastructure/fa-depreciation-line.repository";
import { FaDepreciationRunRepository, ListFaDepreciationRunsFilter } from "../infrastructure/fa-depreciation-run.repository";
import { divideMoneyByInt } from "./money-divide.util";

/** `appr_workflow_def.domain_code` monthly depreciation runs submit under — the `0900` seed registers a single-level System-Admin workflow under this code (`seedSingleLevelWorkflow()`). */
export const DEPRECIATION_APPROVAL_DOMAIN_CODE = "DEPRECIATION";

/**
 * THE monthly depreciation engine (FR-FA-003.1, BR-FA-01). One
 * `fa_depreciation_run` per `gl_period` (`uq_fa_depreciation_run_period_id`),
 * with one `fa_depreciation_line` per eligible asset.
 *
 * **Per-category method**: `SL` — `(cost-residual_value)/life_months` (the
 * SAME monthly charge every period, `life_months` taken from
 * `asset.life_months_override` when set, else the category's own).
 * `RB` — `nbv × rate / 12` (`rate` the category's annual reducing-balance
 * rate; `nbv` re-derived EVERY run from the asset's CURRENT
 * `accum_depreciation`, the defining trait of reducing-balance — each
 * period's charge shrinks as the balance declines).
 *
 * **Day-count proration** (FR-FA-003.1 "prorated from the in-service
 * month" — the task brief leaves the exact convention open, "your call,
 * document it"): ONLY the period whose `[starts_on, ends_on]` range contains
 * `asset.in_service_from` is prorated — ratio = (days from `in_service_from`
 * through the period's last day, inclusive) / (total days in the period).
 * Every period strictly AFTER that one gets the full, unprorated charge.
 * (Periods strictly before `in_service_from` are skipped entirely — the
 * asset wasn't in service yet.) See `computeProrationRatio()` below.
 *
 * **BR-FA-01 cap/skip** — the DB's `ck_fa_asset_accum_dep_within_depreciable_base`
 * CHECK is only the backstop; THIS method is the real enforcement
 * ("fully-depreciated assets stop depreciating automatically"): for every
 * eligible asset, `headroom = (cost - residual_value) - accum_depreciation`
 * is computed BEFORE charging anything, the computed charge (full or
 * prorated) is capped to `min(charge, headroom)`, and if the capped charge is
 * `<= 0` the asset is skipped entirely — NO line is inserted for it, rather
 * than inserting a zero/negative-amount line the DB CHECK would then reject
 * and abort the whole run.
 */
@Injectable()
export class DepreciationRunsService {
  constructor(
    private readonly runRepository: FaDepreciationRunRepository,
    private readonly lineRepository: FaDepreciationLineRepository,
    private readonly assetRepository: FaAssetRepository,
    private readonly categoryRepository: FaCategoryRepository,
    private readonly periodRepository: GlPeriodRepository,
    private readonly postingService: PostingService,
    private readonly approvalEngine: ApprovalEngineService,
  ) {}

  /**
   * `status='DRAFT'`. Populates lines from `FaAssetRepository.findActiveForDepreciation()`
   * (ACTIVE assets whose `accum_depreciation` is still below their
   * depreciable base) — see class doc comment for the SL/RB/proration/cap
   * math applied to each.
   */
  async createRun(em: EntityManager, periodId: string, initiatedBy: string | null = null): Promise<FaDepreciationRunEntity> {
    const existing = await this.runRepository.findByPeriodId(periodId, em);
    if (existing) {
      throw new ConflictException(
        `A depreciation run already exists for period ${periodId} (uq_fa_depreciation_run_period_id)`,
      );
    }
    const period = await this.periodRepository.findByIdOrFail(periodId, em);

    const run = await this.runRepository.create(
      { periodId, status: "DRAFT", approvalRef: null, journalId: null, createdBy: initiatedBy, updatedBy: initiatedBy },
      em,
    );

    const assets = await this.assetRepository.findActiveForDepreciation(em);
    const categoryCache = new Map<string, FaCategoryEntity>();

    for (const asset of assets) {
      if (asset.inServiceFrom > period.endsOn) {
        continue; // not yet in service during this period
      }

      let category = categoryCache.get(asset.categoryId);
      if (!category) {
        category = await this.categoryRepository.findByIdOrFail(asset.categoryId, em);
        categoryCache.set(asset.categoryId, category);
      }

      const depreciableBase = asset.cost.subtract(asset.residualValue);
      const headroom = depreciableBase.subtract(asset.accumDepreciation);
      if (!headroom.isPositive()) {
        continue; // BR-FA-01 — already fully depreciated, nothing to charge
      }

      const fullCharge = this.computeFullPeriodCharge(asset, category, depreciableBase);

      let charge = fullCharge;
      if (period.startsOn <= asset.inServiceFrom && asset.inServiceFrom <= period.endsOn) {
        const ratio = computeProrationRatio(asset.inServiceFrom, period.startsOn, period.endsOn);
        charge = fullCharge.multiply(ratio, RoundingMode.HALF_UP);
      }

      if (charge.compare(headroom) > 0) {
        charge = headroom; // BR-FA-01 cap — never depreciate below residual_value
      }
      if (!charge.isPositive()) {
        continue; // capped to zero — skip entirely, don't insert a zero-amount line
      }

      const nbvAfter = asset.cost.subtract(asset.accumDepreciation.add(charge));
      await this.lineRepository.create(
        { runId: run.id, assetId: asset.id, amount: charge, nbvAfter },
        em,
      );
    }

    return run;
  }

  private computeFullPeriodCharge(asset: FaAssetEntity, category: FaCategoryEntity, depreciableBase: Money): Money {
    const lifeMonths = asset.lifeMonthsOverride ?? category.lifeMonths;
    if (category.method === "SL") {
      return divideMoneyByInt(depreciableBase, lifeMonths, RoundingMode.HALF_UP);
    }
    if (!category.rate) {
      throw new ValidationException(
        `fa_category ${category.id} has method='RB' but no rate set — cannot compute depreciation for asset ${asset.id}`,
      );
    }
    const nbv = asset.cost.subtract(asset.accumDepreciation);
    const annualCharge = nbv.multiply(category.rate, RoundingMode.HALF_UP);
    return divideMoneyByInt(annualCharge, 12, RoundingMode.HALF_UP);
  }

  /** Sums line amounts as the approval `amount`. `domainCode='DEPRECIATION'`. */
  async submitForApproval(em: EntityManager, runId: string, initiatorId: string): Promise<FaDepreciationRunEntity> {
    const run = await this.runRepository.findByIdOrFail(runId, em);
    if (run.status !== "DRAFT") {
      throw new ValidationException(`Only a DRAFT depreciation run can be submitted (run ${runId} status=${run.status})`);
    }

    const lines = await this.lineRepository.findByRunId(runId, em);
    if (lines.length === 0) {
      throw new ValidationException(`Depreciation run ${runId} has no lines — nothing to submit`);
    }
    const total = lines.reduce((sum, line) => sum.add(line.amount), Money.ZERO);

    const instance = await this.approvalEngine.submit(em, {
      domainCode: DEPRECIATION_APPROVAL_DOMAIN_CODE,
      entityType: "fa_depreciation_run",
      entityId: run.id,
      amount: total,
      initiatorId,
    });

    run.status = "PENDING_APPROVAL";
    run.approvalRef = instance.id;
    run.updatedBy = initiatorId;
    return this.runRepository.save(run, em);
  }

  /**
   * Interim manual-trigger pattern (no event dispatcher exists anywhere in
   * this codebase yet). `fa_depreciation_run.status` is a 3-value enum
   * (`DRAFT|PENDING_APPROVAL|POSTED`, no dedicated `APPROVED` value — see
   * `FaDepreciationRunEntity`'s own doc comment) — mirrors
   * `StockTakesService.onApprovalDecided()`'s exact pattern for the same
   * reason: on REJECT, `status` reverts to `DRAFT` (the only earlier state to
   * go back to); on APPROVE, `status` deliberately stays `PENDING_APPROVAL`
   * — `post()` verifies readiness directly via
   * `ApprovalEngineService.getStatus()`, the real `appr_instance.status`
   * column that DOES have a genuine `APPROVED` value.
   */
  async onApprovalDecided(
    em: EntityManager,
    runId: string,
    approved: boolean,
    actorId: string | null = null,
  ): Promise<FaDepreciationRunEntity> {
    const run = await this.runRepository.findByIdOrFail(runId, em);
    if (run.status !== "PENDING_APPROVAL") {
      throw new ValidationException(`fa_depreciation_run ${runId} is not PENDING_APPROVAL (status=${run.status})`);
    }
    if (approved) {
      return run; // see doc comment — no persisted status change; post() verifies via ApprovalEngineService directly.
    }
    run.status = "DRAFT";
    run.approvalRef = null;
    run.updatedBy = actorId;
    return this.runRepository.save(run, em);
  }

  /**
   * Requires `PENDING_APPROVAL` + a genuinely `APPROVED` `DEPRECIATION`
   * `appr_instance`. **P-30 per-category aggregation**: lines are grouped by
   * their asset's `category_id` (since each `fa_category` owns its OWN
   * `gl_dep_expense_account_id`/`gl_accum_dep_account_id` pair), each group's
   * total summed, and exactly ONE debit/credit pair emitted per category —
   * NOT per-asset — to keep the journal reasonably sized. ONE
   * `PostingService.post()` call for the whole run. Updates every affected
   * `fa_asset.accum_depreciation += line.amount` (safe — `uq_fa_depreciation_line_run_asset`
   * guarantees at most one line per asset per run, no double-counting).
   */
  async post(em: EntityManager, runId: string, postedBy: string): Promise<FaDepreciationRunEntity> {
    const run = await this.runRepository.findByIdOrFail(runId, em);
    if (run.status !== "PENDING_APPROVAL") {
      throw new ValidationException(
        `DepreciationRunsService.post: only a PENDING_APPROVAL run (with an APPROVED DEPRECIATION instance) can be posted (run ${runId} status=${run.status})`,
      );
    }
    if (!run.approvalRef) {
      throw new ValidationException(`DepreciationRunsService.post: run ${runId} has no approval_ref attached`);
    }
    const instance = await this.approvalEngine.getStatus("fa_depreciation_run", runId);
    if (!instance || instance.status !== "APPROVED") {
      throw new ValidationException(
        `DepreciationRunsService.post: run ${runId}'s DEPRECIATION approval instance is not APPROVED (current: ${instance?.status ?? "none"})`,
      );
    }

    const lines = await this.lineRepository.findByRunId(runId, em);
    if (lines.length === 0) {
      throw new ValidationException(`DepreciationRunsService.post: run ${runId} has no lines to post`);
    }

    const assetCache = new Map<string, FaAssetEntity>();
    const categoryTotals = new Map<string, Money>();
    for (const line of lines) {
      let asset = assetCache.get(line.assetId);
      if (!asset) {
        asset = await this.assetRepository.findByIdOrFail(line.assetId, em);
        assetCache.set(line.assetId, asset);
      }
      const existing = categoryTotals.get(asset.categoryId) ?? Money.ZERO;
      categoryTotals.set(asset.categoryId, existing.add(line.amount));
    }

    const journalLines: PostJournalLineDraft[] = [];
    for (const [categoryId, total] of categoryTotals) {
      const category = await this.categoryRepository.findByIdOrFail(categoryId, em);
      journalLines.push({
        accountId: category.glDepExpenseAccountId,
        debit: total,
        credit: Money.ZERO,
        memo: `P-30 depreciation expense — ${category.name}`,
        entityRefType: "fa_category",
        entityRefId: category.id,
      });
      journalLines.push({
        accountId: category.glAccumDepAccountId,
        debit: Money.ZERO,
        credit: total,
        memo: `P-30 accumulated depreciation — ${category.name}`,
        entityRefType: "fa_category",
        entityRefId: category.id,
      });
    }

    const period = await this.periodRepository.findByIdOrFail(run.periodId, em);
    const journal = await this.postingService.post(em, {
      journalDate: period.endsOn,
      periodId: period.id,
      sourceModule: "fixed-assets",
      sourceDocType: "fa_depreciation_run",
      sourceDocId: run.id,
      narration: `P-30 depreciation run posted for period ${period.seq}`,
      journalType: "MANUAL",
      postedBy,
      approvalRef: run.approvalRef ?? undefined,
      lines: journalLines,
    });

    for (const line of lines) {
      const asset = assetCache.get(line.assetId)!;
      asset.accumDepreciation = asset.accumDepreciation.add(line.amount);
      asset.updatedBy = postedBy;
      await this.assetRepository.save(asset, em);
    }

    run.status = "POSTED";
    run.journalId = journal.id;
    run.updatedBy = postedBy;
    return this.runRepository.save(run, em);
  }

  async findByIdOrFail(id: string): Promise<FaDepreciationRunEntity> {
    return this.runRepository.findByIdOrFail(id);
  }

  async listLines(runId: string): Promise<FaDepreciationLineEntity[]> {
    return this.lineRepository.findByRunId(runId);
  }

  async list(filter: ListFaDepreciationRunsFilter = {}): Promise<FaDepreciationRunEntity[]> {
    return this.runRepository.list(filter);
  }
}

/**
 * Day-count proration for the FIRST period an asset enters service partway
 * through — ratio = (days from `inServiceFrom` through the period's last
 * day, inclusive) / (total days in the period). E.g. an asset entering
 * service on day 16 of a 30-day period gets 15/30 of that period's full
 * charge (days 16-30 inclusive = 15 days). Rounded to 6dp (matches
 * `Money.multiply()`'s own rate-scale precision).
 */
function computeProrationRatio(inServiceFrom: string, periodStartsOn: string, periodEndsOn: string): string {
  const ONE_DAY_MS = 86_400_000;
  const start = Date.parse(`${periodStartsOn}T00:00:00Z`);
  const end = Date.parse(`${periodEndsOn}T00:00:00Z`);
  const inService = Date.parse(`${inServiceFrom}T00:00:00Z`);
  const totalDays = Math.round((end - start) / ONE_DAY_MS) + 1;
  const daysInService = Math.round((end - inService) / ONE_DAY_MS) + 1;
  return (daysInService / totalDays).toFixed(6);
}

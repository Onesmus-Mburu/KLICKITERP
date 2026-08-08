import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { ApprovalEngineService } from "../../../platform/approvals";
import { NumberingService } from "../../../platform/settings";
import { FaVerificationEntity } from "../domain/fa-verification.entity";
import { FaVerificationLineEntity } from "../domain/fa-verification-line.entity";
import { FaVerificationRepository, ListFaVerificationsFilter } from "../infrastructure/fa-verification.repository";
import { FaVerificationLineRepository } from "../infrastructure/fa-verification-line.repository";
import { FaAssetRepository } from "../infrastructure/fa-asset.repository";
import { AssetsService } from "./assets.service";

/** `appr_workflow_def.domain_code` a verification session's variance report submits under — a NEW domain code (documented judgement call: `STOCK_ADJUSTMENTS` didn't conceptually fit, a physical asset count isn't a stock variance), the `0900` seed registers its own single-level System-Admin workflow under this code. */
export const ASSET_VERIFICATION_APPROVAL_DOMAIN_CODE = "ASSET_VERIFICATION";

/**
 * Scope shape — this pass's own documented judgement call (Fixed Assets has
 * no `fa_store`-equivalent table, unlike `inv_stock_take.store_id`, so
 * `scope` alone carries the selector, mirroring `InvStockTakeEntity.scope`'s
 * own "opaque selector, evaluated by the service layer" role):
 * `assetIds: "ALL"` resolves to every currently `ACTIVE` asset
 * (disposed/written-off/transferred/under-maintenance assets aren't in scope
 * for an ordinary physical count); an explicit array names exactly which
 * assets are in scope (a location/category sweep, pre-resolved by the caller
 * before calling `createSession()`).
 */
export interface FaVerificationScope {
  assetIds: string[] | "ALL";
}

export interface RecordVerificationCountInput {
  lineId: string;
  found: boolean;
  condition?: string | null;
  notes?: string | null;
}

export interface PostVerificationResult {
  verification: FaVerificationEntity;
  /**
   * Lines where `found=false` at post() time — a plain report (no such
   * schema table exists in the DDL), NOT an automatic disposal. A human acts
   * on each entry separately via
   * `DisposalService.create({assetId, method:'WRITE_OFF', ...})`.
   */
  missingAssetIds: string[];
}

/**
 * `fa_verification` (+lines) physical asset-verification session
 * (FR-FA-007.1), mirroring `StockTakesService`'s exact workflow shape per
 * this module's own explicit instruction: create session (freeze/snapshot)
 * -> record counts -> submit -> decide -> post (missing-asset report, NOT
 * automatic disposal).
 */
@Injectable()
export class VerificationService {
  constructor(
    private readonly verificationRepository: FaVerificationRepository,
    private readonly lineRepository: FaVerificationLineRepository,
    private readonly assetRepository: FaAssetRepository,
    private readonly assetsService: AssetsService,
    private readonly approvalEngine: ApprovalEngineService,
    private readonly numberingService: NumberingService,
  ) {}

  /**
   * `status='OPEN'`, `snapshot_at=now()`. One `fa_verification_line` per
   * asset in scope, `found=false` default (see `FaVerificationLineEntity`'s
   * own doc comment) until `recordCounts()` fills it in.
   */
  async createSession(em: EntityManager, scope: FaVerificationScope, initiatedBy: string | null): Promise<FaVerificationEntity> {
    let assetIds: string[];
    if (scope.assetIds === "ALL") {
      const activeAssets = await this.assetRepository.list({ status: "ACTIVE" }, em);
      assetIds = activeAssets.map((a) => a.id);
      if (assetIds.length === 0) {
        throw new ValidationException(
          "VerificationService.createSession: no ACTIVE assets to verify (scope.assetIds='ALL')",
        );
      }
    } else {
      if (scope.assetIds.length === 0) {
        throw new ValidationException("VerificationService.createSession: scope.assetIds must be non-empty (or 'ALL')");
      }
      assetIds = [...new Set(scope.assetIds)];
    }

    const number = await this.numberingService.allocate(em, "FA_VERIFICATION");
    const verification = await this.verificationRepository.create(
      {
        number,
        scope: scope as unknown as Record<string, unknown>,
        snapshotAt: new Date(),
        status: "OPEN",
        approvalRef: null,
        journalId: null,
        createdBy: initiatedBy,
        updatedBy: initiatedBy,
      },
      em,
    );

    for (const assetId of assetIds) {
      await this.assetRepository.findByIdOrFail(assetId, em);
      await this.lineRepository.create(
        {
          verificationId: verification.id,
          assetId,
          found: false,
          condition: null,
          notes: null,
          createdBy: initiatedBy,
          updatedBy: initiatedBy,
        },
        em,
      );
    }

    return verification;
  }

  /**
   * Fills in `found`/`condition`/`notes` for the given lines.
   * **Completeness signal**: `found` is a NOT NULL boolean whose `false`
   * default doubles as BOTH "not yet examined" AND "confirmed missing" (per
   * `FaVerificationLineEntity`'s own foundation-pass doc comment — a
   * deliberate schema-level collapsing of those two states), so unlike
   * `inv_stock_take_line.countedQty` there is no nullable column that
   * naturally distinguishes "processed" from "untouched". This method
   * repurposes `notes` for that signal instead: an omitted `notes` is
   * defaulted to `""` (empty string, never left `null`) the first time a
   * line is recorded, so "every line has been recorded at least once" can be
   * checked via `notes !== null` — `notes` stays genuinely `null` ONLY for a
   * line `recordCounts()` has never touched. `status` progresses
   * `OPEN -> COUNTING` on the first call, `-> REVIEW` once every line has
   * been recorded — mirrors `StockTakesService.recordCounts()`'s shape.
   */
  async recordCounts(
    em: EntityManager,
    verificationId: string,
    counts: RecordVerificationCountInput[],
    actorId: string | null = null,
  ): Promise<FaVerificationEntity> {
    const verification = await this.verificationRepository.findByIdOrFail(verificationId, em);
    if (!["OPEN", "COUNTING"].includes(verification.status)) {
      throw new ValidationException(
        `VerificationService.recordCounts: counts can only be recorded while OPEN/COUNTING (verification ${verificationId} status=${verification.status})`,
      );
    }
    if (counts.length === 0) {
      throw new ValidationException("VerificationService.recordCounts: counts must be non-empty");
    }

    for (const count of counts) {
      const line = await this.lineRepository.findByIdOrFail(count.lineId, em);
      if (line.verificationId !== verificationId) {
        throw new ValidationException(`Line ${count.lineId} does not belong to verification ${verificationId}`);
      }
      line.found = count.found;
      if (count.condition !== undefined) line.condition = count.condition;
      line.notes = count.notes !== undefined ? count.notes : (line.notes ?? "");
      line.updatedBy = actorId;
      await this.lineRepository.save(line, em);
    }

    const allLines = await this.lineRepository.findByVerificationId(verificationId, em);
    const allCounted = allLines.every((line) => line.notes !== null);
    verification.status = allCounted ? "REVIEW" : "COUNTING";
    verification.updatedBy = actorId;
    return this.verificationRepository.save(verification, em);
  }

  /**
   * No natural monetary amount for a physical-count session — `amount: null`
   * is passed to `ApprovalEngineService.submit()`, whose documented fallback
   * applies ALL of the workflow version's levels (same as any
   * unmatched-routing-rule submission).
   */
  async submitForApproval(em: EntityManager, verificationId: string, initiatorId: string): Promise<FaVerificationEntity> {
    const verification = await this.verificationRepository.findByIdOrFail(verificationId, em);
    if (verification.status !== "REVIEW") {
      throw new ValidationException(
        `VerificationService.submitForApproval: only a REVIEW verification can be submitted (verification ${verificationId} status=${verification.status})`,
      );
    }

    const instance = await this.approvalEngine.submit(em, {
      domainCode: ASSET_VERIFICATION_APPROVAL_DOMAIN_CODE,
      entityType: "fa_verification",
      entityId: verification.id,
      amount: null,
      initiatorId,
    });

    verification.status = "PENDING_APPROVAL";
    verification.approvalRef = instance.id;
    verification.updatedBy = initiatorId;
    return this.verificationRepository.save(verification, em);
  }

  /**
   * Interim manual-trigger pattern — mirrors
   * `StockTakesService.onApprovalDecided()` exactly (same 6-value status
   * enum, no dedicated `APPROVED` value): REJECT/RETURN reverts to `REVIEW`;
   * APPROVE leaves `status` at `PENDING_APPROVAL` and `post()` verifies
   * readiness directly via `ApprovalEngineService.getStatus()`.
   */
  async onApprovalDecided(
    em: EntityManager,
    verificationId: string,
    approved: boolean,
    actorId: string | null = null,
  ): Promise<FaVerificationEntity> {
    const verification = await this.verificationRepository.findByIdOrFail(verificationId, em);
    if (verification.status !== "PENDING_APPROVAL") {
      throw new ValidationException(`fa_verification ${verificationId} is not PENDING_APPROVAL (status=${verification.status})`);
    }
    if (approved) {
      return verification; // see doc comment — no persisted status change; post() verifies via ApprovalEngineService directly.
    }
    verification.status = "REVIEW";
    verification.updatedBy = actorId;
    return this.verificationRepository.save(verification, em);
  }

  /**
   * Requires `PENDING_APPROVAL` + a genuinely `APPROVED`
   * `ASSET_VERIFICATION` instance. Applies `condition` updates for every
   * FOUND line (via `AssetsService.updateCondition()`, composed inside this
   * same transaction), compiles every `found=false` line's `assetId` into
   * `missingAssetIds` — a plain report, NOT an automatic disposal
   * (FR-FA-007.1: "a human must act on the proposal via the disposal service
   * separately"). No GL impact from this method itself — `journal_id` stays
   * `null` (mirrors `inv_stock_take.journal_id`'s "populated only if/when a
   * variance write-off posts through this session" role, but this module's
   * write-off path is a SEPARATE `DisposalService` call, not this session
   * itself).
   */
  async post(em: EntityManager, verificationId: string, postedBy: string): Promise<PostVerificationResult> {
    const verification = await this.verificationRepository.findByIdOrFail(verificationId, em);
    if (verification.status !== "PENDING_APPROVAL") {
      throw new ValidationException(
        `VerificationService.post: only a PENDING_APPROVAL verification (with an APPROVED ASSET_VERIFICATION instance) can be posted (verification ${verificationId} status=${verification.status})`,
      );
    }
    if (!verification.approvalRef) {
      throw new ValidationException(`VerificationService.post: verification ${verificationId} has no approval_ref attached`);
    }
    const instance = await this.approvalEngine.getStatus("fa_verification", verificationId);
    if (!instance || instance.status !== "APPROVED") {
      throw new ValidationException(
        `VerificationService.post: verification ${verificationId}'s ASSET_VERIFICATION approval instance is not APPROVED (current: ${instance?.status ?? "none"})`,
      );
    }

    const lines = await this.lineRepository.findByVerificationId(verificationId, em);
    const missingAssetIds: string[] = [];
    for (const line of lines) {
      if (line.found) {
        if (line.condition) {
          await this.assetsService.updateCondition(line.assetId, line.condition, postedBy, em);
        }
      } else {
        missingAssetIds.push(line.assetId);
      }
    }

    verification.status = "POSTED";
    verification.updatedBy = postedBy;
    const saved = await this.verificationRepository.save(verification, em);

    return { verification: saved, missingAssetIds };
  }

  async findByIdOrFail(id: string): Promise<FaVerificationEntity> {
    return this.verificationRepository.findByIdOrFail(id);
  }

  async listLines(verificationId: string): Promise<FaVerificationLineEntity[]> {
    return this.lineRepository.findByVerificationId(verificationId);
  }

  async list(filter: ListFaVerificationsFilter = {}): Promise<FaVerificationEntity[]> {
    return this.verificationRepository.list(filter);
  }
}

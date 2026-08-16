import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { FaMaintenanceEntity, FaMaintenanceKind } from "../domain/fa-maintenance.entity";
import { FaMaintenanceRepository } from "../infrastructure/fa-maintenance.repository";
import { FaAssetRepository } from "../infrastructure/fa-asset.repository";

const DEFAULT_DOWNTIME_NOTE = "";

/** Postgres foreign_key_violation SQLSTATE — see `assets.service.ts`'s own `isUniqueViolation` for the same driver-error-shape-reading pattern (there for `23505`, here for `23503`). */
const PG_FOREIGN_KEY_VIOLATION = "23503";

export interface ScheduleMaintenanceInput {
  assetId: string;
  kind: FaMaintenanceKind;
  scheduledOn?: string | null;
  downtimeNote?: string;
}

export interface CompleteMaintenanceInput {
  doneOn: string;
  downtimeNote?: string;
  /**
   * An ALREADY-CREATED `exp_voucher` id from `domains/expenses` — this
   * service does not create expense vouchers itself, just links one if the
   * caller supplies it (one-directional coupling, kept deliberately simple).
   */
  costExpenseVoucherId?: string | null;
}

/**
 * CRUD for `fa_maintenance` (`kind='PLANNED'|'REPAIR'`). `downtime_note` is
 * `NOT NULL` in the DDL despite being genuinely filled in progressively (per
 * `FaMaintenanceEntity`'s own doc comment) — `schedule()` defaults an
 * omitted note to `""` rather than leaving it unset; `complete()` can
 * overwrite it with the final downtime summary.
 *
 * **`fa_asset.status` flip timing** — the task brief leaves this open
 * ("your call"): `schedule()` flips the asset to `UNDER_MAINTENANCE`
 * immediately (a scheduled-but-not-yet-started PLANNED event still marks the
 * asset unavailable for ordinary depreciation/transfer/verification
 * purposes, the same as an in-progress REPAIR), and `complete()` flips it
 * back to `ACTIVE`.
 */
@Injectable()
export class MaintenanceService {
  constructor(
    private readonly maintenanceRepository: FaMaintenanceRepository,
    private readonly assetRepository: FaAssetRepository,
  ) {}

  async schedule(em: EntityManager, input: ScheduleMaintenanceInput, actorId: string | null): Promise<FaMaintenanceEntity> {
    const asset = await this.assetRepository.findByIdOrFail(input.assetId, em);

    const maintenance = await this.maintenanceRepository.create(
      {
        assetId: input.assetId,
        kind: input.kind,
        scheduledOn: input.scheduledOn ?? null,
        doneOn: null,
        costExpenseVoucherId: null,
        downtimeNote: input.downtimeNote ?? DEFAULT_DOWNTIME_NOTE,
        createdBy: actorId,
        updatedBy: actorId,
      },
      em,
    );

    asset.status = "UNDER_MAINTENANCE";
    asset.updatedBy = actorId;
    await this.assetRepository.save(asset, em);

    return maintenance;
  }

  async complete(
    em: EntityManager,
    maintenanceId: string,
    input: CompleteMaintenanceInput,
    actorId: string | null,
  ): Promise<FaMaintenanceEntity> {
    const maintenance = await this.maintenanceRepository.findByIdOrFail(maintenanceId, em);
    if (maintenance.doneOn) {
      throw new ValidationException(`fa_maintenance ${maintenanceId} is already complete (done_on already set)`);
    }
    maintenance.doneOn = input.doneOn;
    if (input.downtimeNote !== undefined) maintenance.downtimeNote = input.downtimeNote;
    if (input.costExpenseVoucherId !== undefined) maintenance.costExpenseVoucherId = input.costExpenseVoucherId;
    maintenance.updatedBy = actorId;

    let saved: FaMaintenanceEntity;
    try {
      saved = await this.maintenanceRepository.save(maintenance, em);
    } catch (error) {
      // Phase 6 Slice 23 Part 2 opportunistic fix — `costExpenseVoucherId`
      // is never existence-checked at the DTO/service layer (confirmed:
      // `CompleteFaMaintenanceDto` only carries `@IsUUID()`), but
      // `fa_maintenance.cost_expense_voucher_id` IS a real FK to
      // `exp_voucher` (`fk_fa_maintenance_cost_expense_voucher_id`) — a
      // syntactically-valid but non-existent id previously reached the
      // caller as a raw, unhandled `500` (live-confirmed during this part's
      // own verification pass, not assumed). Same
      // catch-the-real-Postgres-code-and-translate discipline
      // `assets.service.ts`'s own `isUniqueViolation` catch already
      // establishes, just for `23503` instead of `23505`.
      if (isForeignKeyViolation(error) && input.costExpenseVoucherId) {
        throw new ValidationException(
          `fa_maintenance.cost_expense_voucher_id "${input.costExpenseVoucherId}" does not reference an existing exp_voucher`,
        );
      }
      throw error;
    }

    const asset = await this.assetRepository.findByIdOrFail(maintenance.assetId, em);
    asset.status = "ACTIVE";
    asset.updatedBy = actorId;
    await this.assetRepository.save(asset, em);

    return saved;
  }

  async findByIdOrFail(id: string): Promise<FaMaintenanceEntity> {
    return this.maintenanceRepository.findByIdOrFail(id);
  }

  async listByAsset(assetId: string): Promise<FaMaintenanceEntity[]> {
    return this.maintenanceRepository.findByAssetId(assetId);
  }
}

function isForeignKeyViolation(error: unknown): boolean {
  const code =
    (error as { code?: string; driverError?: { code?: string } })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === PG_FOREIGN_KEY_VIOLATION;
}

import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { FaMaintenanceEntity, FaMaintenanceKind } from "../domain/fa-maintenance.entity";
import { FaMaintenanceRepository } from "../infrastructure/fa-maintenance.repository";
import { FaAssetRepository } from "../infrastructure/fa-asset.repository";

const DEFAULT_DOWNTIME_NOTE = "";

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
    const saved = await this.maintenanceRepository.save(maintenance, em);

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

import { Injectable } from "@nestjs/common";
import { ConflictException } from "../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../shared/exceptions/validation.exception";
import { LicenseEntity, LicenseState } from "../domain/license.entity";
import { UpdateNoticeEntity, UpdateNoticeUrgency } from "../domain/update-notice.entity";
import { UsagePayload } from "../domain/usage-snapshot.entity";
import { LicenseRepository } from "../infrastructure/license.repository";
import { UsageSnapshotRepository } from "../infrastructure/usage-snapshot.repository";
import { UsageStatsViewRepository } from "../infrastructure/usage-stats-view.repository";
import { deriveState } from "./license-state-machine";
import { UpdateNoticesService } from "./update-notices.service";

/**
 * Mirrors `packages/server/package.json`'s `version` field. Kept as a
 * literal constant rather than `import ... from "../../../package.json"` —
 * `packages/server/tsconfig.json` sets `rootDir: "src"`, and importing a
 * JSON file that lives OUTSIDE `src` risks TS6059 ("File is not under
 * 'rootDir'") even under `--noEmit` in some TypeScript configurations; a
 * one-line literal, updated alongside real version bumps, is the safer
 * choice for a single non-critical display field.
 */
const LICENSE_API_VERSION = "0.1.0";

export interface RegisterInput {
  schoolId: string;
  plan: string;
  features?: string[];
  validFrom: string;
  validTo: string;
  graceDays?: number;
}

export interface SubscriptionInput {
  plan?: string;
  features?: string[];
}

export interface ActivateInput {
  validFrom?: string;
  validTo?: string;
  graceDays?: number;
}

export interface RenewInput {
  validTo: string;
  graceDays?: number;
}

export interface UpdateNoticeInput {
  version: string;
  notes: string;
  urgency: UpdateNoticeUrgency;
  mandatoryBy?: string | null;
}

export interface LicenseStatusView {
  schoolId: string;
  plan: string;
  features: string[];
  validFrom: string;
  validTo: string;
  graceDays: number;
  state: LicenseState;
  verifiedAt: string | null;
  stateChangedAt: string | null;
}

function toStatusView(entity: LicenseEntity): LicenseStatusView {
  return {
    schoolId: entity.schoolId,
    plan: entity.plan,
    features: entity.features,
    validFrom: entity.validFrom,
    validTo: entity.validTo,
    graceDays: entity.graceDays,
    state: entity.state,
    verifiedAt: entity.verifiedAt ? entity.verifiedAt.toISOString() : null,
    stateChangedAt: entity.stateChangedAt ? entity.stateChangedAt.toISOString() : null,
  };
}

/**
 * FR-LIC-002.1's 9 enumerated `/license/v1/*` handlers — the mutual-auth
 * API's own lifecycle-management channel over the SAME singular
 * `license.license` row `LicenseFileService` (the license-FILE channel)
 * manages, sharing its `deriveState()` state machine so the two channels
 * can never disagree (see that service's own doc comment for the full
 * two-channel relationship). Each handler is deliberately narrow — a single
 * documented state transition or read — per the task's own explicit
 * instruction to resist building a generic CRUD surface here.
 */
@Injectable()
export class LicenseApiService {
  constructor(
    private readonly licenseRepository: LicenseRepository,
    private readonly usageStatsViewRepository: UsageStatsViewRepository,
    private readonly usageSnapshotRepository: UsageSnapshotRepository,
    private readonly updateNoticesService: UpdateNoticesService,
  ) {}

  /** Provisions (or re-provisions) the singular license row — always resets state to `PROVISIONED`. */
  async register(input: RegisterInput): Promise<LicenseStatusView> {
    if (!input.schoolId || !input.plan || !input.validFrom || !input.validTo) {
      throw new ValidationException("register requires schoolId, plan, validFrom, validTo");
    }
    const now = new Date();
    const graceDays = input.graceDays ?? 14;
    const existing = await this.licenseRepository.findCurrent();

    if (existing) {
      existing.schoolId = input.schoolId;
      existing.plan = input.plan;
      existing.features = input.features ?? [];
      existing.validFrom = input.validFrom;
      existing.validTo = input.validTo;
      existing.graceDays = graceDays;
      if (existing.state !== "PROVISIONED") {
        existing.state = "PROVISIONED";
        existing.stateChangedAt = now;
      }
      return toStatusView(await this.licenseRepository.save(existing));
    }

    const created = await this.licenseRepository.create({
      schoolId: input.schoolId,
      plan: input.plan,
      features: input.features ?? [],
      validFrom: input.validFrom,
      validTo: input.validTo,
      graceDays,
      state: "PROVISIONED",
      stateChangedAt: now,
    });
    return toStatusView(created);
  }

  /** Updates plan/features on the existing license row — never touches state. */
  async subscription(input: SubscriptionInput): Promise<LicenseStatusView> {
    const existing = await this.licenseRepository.findCurrentOrFail();
    if (input.plan) {
      existing.plan = input.plan;
    }
    if (input.features) {
      existing.features = input.features;
    }
    return toStatusView(await this.licenseRepository.save(existing));
  }

  /** `PROVISIONED|SUSPENDED|GRACE -> ACTIVE`, optionally refreshing the date window. */
  async activate(input: ActivateInput): Promise<LicenseStatusView> {
    const existing = await this.licenseRepository.findCurrentOrFail();
    if (!["PROVISIONED", "SUSPENDED", "GRACE"].includes(existing.state)) {
      throw new ConflictException(`Cannot activate a license in state "${existing.state}"`, { from: existing.state });
    }
    if (input.validFrom) existing.validFrom = input.validFrom;
    if (input.validTo) existing.validTo = input.validTo;
    if (input.graceDays !== undefined) existing.graceDays = input.graceDays;
    existing.state = "ACTIVE";
    existing.stateChangedAt = new Date();
    return toStatusView(await this.licenseRepository.save(existing));
  }

  /** `ACTIVE|GRACE -> SUSPENDED` — a manual Super Admin suspension (e.g. non-payment), distinct from the automatic grace-expiry path `deriveState()` also reaches. */
  async suspend(): Promise<LicenseStatusView> {
    const existing = await this.licenseRepository.findCurrentOrFail();
    if (!["ACTIVE", "GRACE"].includes(existing.state)) {
      throw new ConflictException(`Cannot suspend a license in state "${existing.state}"`, { from: existing.state });
    }
    existing.state = "SUSPENDED";
    existing.stateChangedAt = new Date();
    return toStatusView(await this.licenseRepository.save(existing));
  }

  /** Extends `valid_to`/`grace_days` and re-derives state — the normal path back to `ACTIVE` from `GRACE`/`SUSPENDED`. */
  async renew(input: RenewInput): Promise<LicenseStatusView> {
    const existing = await this.licenseRepository.findCurrentOrFail();
    if (existing.state === "DEACTIVATED") {
      throw new ConflictException("Cannot renew a DEACTIVATED license — register a new one instead", { from: existing.state });
    }
    if (!input.validTo) {
      throw new ValidationException("renew requires validTo");
    }
    existing.validTo = input.validTo;
    if (input.graceDays !== undefined) existing.graceDays = input.graceDays;

    const now = new Date();
    const nextState = deriveState(
      existing.state,
      { validFrom: existing.validFrom, validTo: existing.validTo, graceDays: existing.graceDays },
      now,
    );
    if (nextState !== existing.state) {
      existing.state = nextState;
      existing.stateChangedAt = now;
    }
    return toStatusView(await this.licenseRepository.save(existing));
  }

  /** Terminal (for this pass — no handler among the 9 ever leaves `DEACTIVATED`) manual deactivation, from any state. */
  async deactivate(): Promise<LicenseStatusView> {
    const existing = await this.licenseRepository.findCurrentOrFail();
    if (existing.state !== "DEACTIVATED") {
      existing.state = "DEACTIVATED";
      existing.stateChangedAt = new Date();
    }
    return toStatusView(await this.licenseRepository.save(existing));
  }

  async status(): Promise<LicenseStatusView> {
    return toStatusView(await this.licenseRepository.findCurrentOrFail());
  }

  /**
   * FR-LIC-005.1's EXACT payload shape (BR-LIC-03: no more, no fewer
   * fields) — the four cross-schema figures come from `license.v_usage_stats`
   * (this module's own resolution to the isolation problem, see migration
   * `0190`'s doc comment), `version`/`uptime_s`/`license_state` are
   * assembled in-process. Also inserts a `license.usage_snapshot` row with
   * this exact payload (BR-LIC-03).
   */
  async usage(): Promise<UsagePayload> {
    const existing = await this.licenseRepository.findCurrentOrFail();
    const stats = await this.usageStatsViewRepository.read();

    const payload: UsagePayload = {
      version: LICENSE_API_VERSION,
      uptime_s: Math.floor(process.uptime()),
      active_users_30d: Number(stats.active_users_30d),
      student_count: Number(stats.student_count),
      storage_bytes: Number(stats.storage_bytes),
      last_backup_at: stats.last_backup_at ? new Date(stats.last_backup_at).toISOString() : null,
      license_state: existing.state,
    };

    await this.usageSnapshotRepository.create({ at: new Date(), payload });
    return payload;
  }

  /** Records a new `license.update_notice` row, `decision='PENDING'`. */
  async updateNotice(input: UpdateNoticeInput): Promise<UpdateNoticeEntity> {
    if (!input.version || !input.notes || !input.urgency) {
      throw new ValidationException("updateNotice requires version, notes, urgency");
    }
    return this.updateNoticesService.record(input);
  }
}

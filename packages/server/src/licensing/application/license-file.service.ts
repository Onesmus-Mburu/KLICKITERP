import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { AppConfigService } from "../../shared/config/app-config.service";
import { LicenseEntity, LicenseState } from "../domain/license.entity";
import { LicenseRepository } from "../infrastructure/license.repository";
import { LicenseFilePayload, verifyLicenseBlob } from "../infrastructure/crypto/license-file-verifier";
import { deriveState } from "./license-state-machine";

/**
 * FR-LIC-001.1's license-FILE channel — a periodically-refreshed, Ed25519-signed
 * JSON blob validated at boot and (per the requirement) every 6h. Distinct
 * from `LicenseApiService`'s mutual-auth API channel (FR-LIC-002.1's 9
 * `/license/v1/*` endpoints, a live Super Admin portal request/response
 * flow) — the two channels manage the SAME singular `license.license` row
 * and share the same `deriveState()` state machine (`license-state-machine.ts`)
 * so they can never disagree about a legal state transition.
 */
@Injectable()
export class LicenseFileService implements OnModuleInit {
  private readonly logger = new Logger(LicenseFileService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly licenseRepository: LicenseRepository,
  ) {}

  /**
   * FR-LIC-001.1 "validated at boot" — fires via Nest's `OnModuleInit`
   * lifecycle whenever `LicensingModule` is mounted into a running app. No
   * such application bootstrap (`main.ts`/root `AppModule`) exists anywhere
   * in this codebase yet — every module is unit/integration tested
   * standalone (docs/phase-5/PROGRESS.md "Environment status") — so this
   * hook is correctly wired but has never actually fired end-to-end in this
   * environment, an honestly documented gap. A missing file is the normal
   * fresh-install case (nothing registered yet) and must never crash boot.
   */
  async onModuleInit(): Promise<void> {
    try {
      const blobText = await readFile(this.config.licenseFilePath, "utf8");
      await this.validateAndApply(blobText);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        this.logger.log(`No license file at ${this.config.licenseFilePath} — instance not yet registered.`);
        return;
      }
      this.logger.warn(`Boot-time license validation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Verifies the Ed25519 signature (current key, falling back to the
   * previous key for §2.6's dual-key rotation overlap window), parses the
   * payload, and upserts the singular `license.license` row. A brand-new
   * row starts its state derivation from `PROVISIONED`; a re-applied file
   * (renewal, plan change) re-derives from the row's CURRENT state — both
   * via the shared `deriveState()` state machine.
   */
  async validateAndApply(blobText: string): Promise<LicenseEntity> {
    const payload = this.verifyAgainstConfiguredKeys(blobText);
    const now = new Date();
    const window = { validFrom: payload.valid_from, validTo: payload.valid_to, graceDays: payload.grace_days };

    const existing = await this.licenseRepository.findCurrent();
    const previousState: LicenseState = existing?.state ?? "PROVISIONED";
    const nextState = deriveState(previousState, window, now);

    if (existing) {
      existing.schoolId = payload.school_id;
      existing.plan = payload.plan;
      existing.features = payload.features;
      existing.validFrom = payload.valid_from;
      existing.validTo = payload.valid_to;
      existing.graceDays = payload.grace_days;
      existing.licenseBlob = blobText;
      existing.verifiedAt = now;
      if (existing.state !== nextState) {
        existing.state = nextState;
        existing.stateChangedAt = now;
      }
      return this.licenseRepository.save(existing);
    }

    return this.licenseRepository.create({
      schoolId: payload.school_id,
      plan: payload.plan,
      features: payload.features,
      validFrom: payload.valid_from,
      validTo: payload.valid_to,
      graceDays: payload.grace_days,
      state: nextState,
      licenseBlob: blobText,
      verifiedAt: now,
      stateChangedAt: now,
    });
  }

  /**
   * Re-evaluates state against the current date with no new file — callable
   * at boot and periodically. FR-LIC-001.1's "every 6h" cadence needs a
   * scheduler/worker this codebase does not have anywhere — the exact same
   * honestly-documented "config/logic exists, the cron dispatcher doesn't"
   * gap as `IntegritySweepService`'s hourly sweep or
   * `WebhookDeliveryService`'s retry batch (docs/phase-5/PROGRESS.md).
   */
  async checkAndRefresh(): Promise<LicenseEntity | null> {
    const existing = await this.licenseRepository.findCurrent();
    if (!existing) {
      return null;
    }
    const now = new Date();
    const window = { validFrom: existing.validFrom, validTo: existing.validTo, graceDays: existing.graceDays };
    const nextState = deriveState(existing.state, window, now);
    if (nextState !== existing.state) {
      existing.state = nextState;
      existing.stateChangedAt = now;
      return this.licenseRepository.save(existing);
    }
    return existing;
  }

  async getCurrentState(): Promise<LicenseState | null> {
    const existing = await this.licenseRepository.findCurrent();
    return existing?.state ?? null;
  }

  private verifyAgainstConfiguredKeys(blobText: string): LicenseFilePayload {
    const current = this.config.infoneyLicensePublicKeyCurrent;
    try {
      return verifyLicenseBlob(blobText, current.publicKey);
    } catch (currentKeyError) {
      const previous = this.config.infoneyLicensePublicKeyPrevious;
      if (!previous) {
        throw currentKeyError;
      }
      try {
        return verifyLicenseBlob(blobText, previous.publicKey);
      } catch {
        throw currentKeyError;
      }
    }
  }
}

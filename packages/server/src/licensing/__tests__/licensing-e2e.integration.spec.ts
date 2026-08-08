import { generateKeyPairSync } from "node:crypto";
import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { DataSource } from "typeorm";
import { AppDataSource } from "../../migrations/data-source";
import { AppConfigService } from "../../shared/config/app-config.service";
import { LicenseStateGuard } from "../../shared/rbac/license-state.guard";
import { LicenseSuspendedException } from "../../shared/exceptions/license-suspended.exception";
import { LicenseEntity } from "../domain/license.entity";
import { LicenseRepository } from "../infrastructure/license.repository";
import { UsageStatsViewRepository } from "../infrastructure/usage-stats-view.repository";
import { LicenseFileService } from "../application/license-file.service";
import { signLicensePayload } from "../infrastructure/crypto/license-file-verifier";

/**
 * Module 21 (Licensing) capstone integration test — mirrors
 * `domains/backups-ops/__tests__/backups-ops-e2e.integration.spec.ts`'s
 * pattern (real repository/service instances, no Nest DI, self-skips
 * without a reachable Postgres; assumes migrations — including `0190`,
 * this module's own `license.*` tables/views — have already been run
 * against the target database, the same assumption every other e2e spec in
 * this codebase makes). Exercises the FULL real path: a genuine
 * Ed25519-signed license file, applied through `LicenseFileService`
 * (real signature verification, no mocked crypto), landing a real
 * `license.license` row whose state both `license.v_state` (the view
 * `LicenseStateGuard` reads) and `license.v_usage_stats` (the view
 * `UsageStatsViewRepository` reads) resolve correctly for — proving out the
 * module's central architectural claim (migration `0190`'s doc comment)
 * against a real database, not just mocks.
 */
describe("licensing module — end-to-end capstone (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(`[licensing-e2e.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`);
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it(
    "applies a real Ed25519-signed license file, verifies license.v_state/license.v_usage_stats are queryable and sane, and confirms LicenseStateGuard blocks a mutation once SUSPENDED",
    async () => {
      if (!dbAvailable || !dataSource) {
        console.warn("[licensing-e2e.integration.spec] SKIPPED (no DB) — licensing capstone flow");
        return; // vacuous pass — the skip decision is only known async, after `it()` registration.
      }
      const source = dataSource;

      const { publicKey, privateKey } = generateKeyPairSync("ed25519");
      const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }) as string;
      const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;

      const config = {
        infoneyLicensePublicKeyCurrent: { kid: "e2e-test-1", publicKey: publicKeyPem },
        infoneyLicensePublicKeyPrevious: null,
        licenseFilePath: "./__does-not-exist__/license.json",
      } as unknown as AppConfigService;

      const licenseRepository = new LicenseRepository(source.getRepository(LicenseEntity) as never);
      const licenseFileService = new LicenseFileService(config, licenseRepository);
      const usageStatsViewRepository = new UsageStatsViewRepository(source);

      // valid_to deliberately far in the past, grace_days minimal — the
      // real deriveState() state machine (exercised through
      // LicenseFileService.validateAndApply(), not called directly) should
      // land this brand-new row at SUSPENDED.
      const blob = signLicensePayload(
        {
          school_id: "11111111-1111-7111-8111-111111111111",
          plan: "STANDARD",
          features: [],
          valid_from: "2020-01-01",
          valid_to: "2020-01-02",
          grace_days: 1,
        },
        privateKeyPem,
      );

      let license: LicenseEntity | null = null;
      try {
        license = await licenseFileService.validateAndApply(blob);
        expect(license.state).toBe("SUSPENDED");
        expect(license.licenseBlob).toBe(blob);

        const stateRows: Array<{ state: string }> = await source.query("SELECT state FROM license.v_state");
        expect(stateRows[0]?.state).toBe("SUSPENDED");

        const usageStats = await usageStatsViewRepository.read();
        expect(Number(usageStats.storage_bytes)).toBeGreaterThanOrEqual(0);
        expect(Number(usageStats.student_count)).toBeGreaterThanOrEqual(0);
        expect(Number(usageStats.active_users_30d)).toBeGreaterThanOrEqual(0);

        LicenseStateGuard.resetCacheForTests();
        const reflector = { getAllAndOverride: jest.fn(() => false) } as unknown as Reflector;
        const guard = new LicenseStateGuard(reflector, source);

        const mutationContext = {
          switchToHttp: () => ({ getRequest: () => ({ method: "POST" }) }),
          getHandler: () => undefined,
          getClass: () => undefined,
        } as unknown as ExecutionContext;
        await expect(guard.canActivate(mutationContext)).rejects.toBeInstanceOf(LicenseSuspendedException);

        LicenseStateGuard.resetCacheForTests();
        const readContext = {
          switchToHttp: () => ({ getRequest: () => ({ method: "GET" }) }),
          getHandler: () => undefined,
          getClass: () => undefined,
        } as unknown as ExecutionContext;
        await expect(guard.canActivate(readContext)).resolves.toBe(true);
      } finally {
        if (license) {
          await source.getRepository(LicenseEntity).delete({ id: license.id });
        }
        LicenseStateGuard.resetCacheForTests();
      }
    },
    30_000,
  );
});

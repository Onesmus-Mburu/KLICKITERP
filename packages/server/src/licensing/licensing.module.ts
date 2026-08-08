import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LicenseEntity } from "./domain/license.entity";
import { ApiCallLogEntity } from "./domain/api-call-log.entity";
import { UsageSnapshotEntity } from "./domain/usage-snapshot.entity";
import { UpdateNoticeEntity } from "./domain/update-notice.entity";
import { LicenseRepository } from "./infrastructure/license.repository";
import { ApiCallLogRepository } from "./infrastructure/api-call-log.repository";
import { UsageSnapshotRepository } from "./infrastructure/usage-snapshot.repository";
import { UpdateNoticeRepository } from "./infrastructure/update-notice.repository";
import { UsageStatsViewRepository } from "./infrastructure/usage-stats-view.repository";
import { JwsMutualAuthService } from "./infrastructure/crypto/jws-mutual-auth";
import { LicenseFileService } from "./application/license-file.service";
import { LicenseApiService } from "./application/license-api.service";
import { ApiCallLoggerService } from "./application/api-call-logger.service";
import { UpdateNoticesService } from "./application/update-notices.service";
import { LicenseMutualAuthGuard } from "./api/license-mutual-auth.guard";
import { LicenseApiController } from "./api/license-api.controller";
import { LicenseStatusController } from "./api/license-status.controller";

/**
 * Module 21 (Licensing) — THE structurally isolated module (module-deps.json
 * `"licensing": {"kind": "isolated", "mayImport": ["shared"], "importableBy": []}`).
 * Every provider/controller below is either shared-kernel or defined inside
 * this module itself — no import anywhere in this file (or transitively,
 * anywhere under `licensing/`) reaches outside `shared/`, and nothing
 * outside this module imports FROM it (CI-enforced via
 * `import/no-restricted-paths`, see `packages/config/eslint/module-deps.json`).
 *
 * `AppConfigService`/`redisClientProvider` are NO LONGER declared as local
 * providers here — the `apps/api` composition root's `SharedInfraModule`
 * (`shared/infra/shared-infra.module.ts`, `@Global()`, itself living under
 * `shared/` — importable per this module's own `"mayImport": ["shared"]`
 * isolation rule) now provides both once for the whole app, closing the
 * redundant-Redis-connection finding documented on that file. `LicenseMutualAuthGuard`
 * is a controller-level guard (`@UseGuards(...)` on `LicenseApiController`),
 * NOT an `APP_GUARD` — it must still be registered as an ordinary provider
 * here for Nest's DI to construct it. The OTHER guard this module's work
 * enables, `LicenseStateGuard`, deliberately does NOT live here at all — it
 * lives in `shared/rbac/` and is wired into `platform/auth`'s `APP_GUARD`
 * list, since `licensing` may be imported by nothing (see that guard's own
 * doc comment for the full isolation reasoning).
 */
@Module({
  imports: [TypeOrmModule.forFeature([LicenseEntity, ApiCallLogEntity, UsageSnapshotEntity, UpdateNoticeEntity])],
  controllers: [LicenseApiController, LicenseStatusController],
  providers: [
    LicenseRepository,
    ApiCallLogRepository,
    UsageSnapshotRepository,
    UpdateNoticeRepository,
    UsageStatsViewRepository,
    JwsMutualAuthService,
    LicenseFileService,
    LicenseApiService,
    ApiCallLoggerService,
    UpdateNoticesService,
    LicenseMutualAuthGuard,
  ],
})
export class LicensingModule {}

import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UsrUserEntity } from "../users/domain/usr-user.entity";
import { UsrSessionEntity } from "../users/domain/usr-session.entity";
import { UsrLoginEventEntity } from "../users/domain/usr-login-event.entity";
import { UsrPasswordHistoryEntity } from "../users/domain/usr-password-history.entity";
import { UsrApiKeyEntity } from "../users/domain/usr-api-key.entity";
import { AuthUsrUserRepository } from "./infrastructure/usr-user.repository";
import { UsrSessionRepository } from "./infrastructure/usr-session.repository";
import { UsrLoginEventRepository } from "./infrastructure/usr-login-event.repository";
import { UsrPasswordHistoryRepository } from "./infrastructure/usr-password-history.repository";
import { UsrApiKeyRepository } from "./infrastructure/usr-api-key.repository";
import { PermissionResolutionRepository } from "./infrastructure/permission-resolution.repository";
import { AuthAuditLogRepository } from "./infrastructure/audit-log.repository";
import { JwtTokenService } from "./infrastructure/jwt-token.service";
import { NOTIFICATION_PORT, LogOnlyAdapter } from "./infrastructure/notification-port";
import { JwtAuthGuard } from "./infrastructure/guards/jwt-auth.guard";
import { PermissionsGuard } from "./infrastructure/guards/permissions.guard";
import { AuthorityGuard } from "./infrastructure/guards/authority.guard";
import { LicenseStateGuard } from "../../shared/rbac/license-state.guard";
import { AuthService } from "./application/auth.service";
import { TwoFactorService } from "./application/two-factor.service";
import { OtpService } from "./application/otp.service";
import { PasswordService } from "./application/password.service";
import { ApiKeyService } from "./application/api-key.service";
import { LockoutService } from "./application/lockout.service";
import { AuthController } from "./api/auth.controller";
import { ApiKeysController } from "./api/api-keys.controller";
import { OutboxWriterService } from "../../shared/events/outbox-writer.service";

/**
 * Wires the request-authorization pipeline (docs/phase-3/02-communication-authentication.md
 * §2.3) as `APP_GUARD` providers, in order: Jwt -> License -> Permissions ->
 * Authority. `SoDGuard` is omitted by design — see `SodCheckService` in
 * `shared/rbac` and the Module 1 report for that boundary decision.
 *
 * **`LicenseStateGuard` (Module 21) closes Module 1's own originally-flagged
 * gap** ("LicenseGuard omitted from the guard pipeline for now, licensing is
 * module 21" — docs/phase-5/00-module-plan.md). It lives in `shared/rbac/`,
 * not `licensing/` — nothing may import `licensing` (module-deps.json
 * `"importableBy": []`), so the guard class itself cannot live inside the
 * isolated module it enforces; it reads license state via the read-only
 * `license.v_state` view instead (raw `DataSource.query()`, see that
 * guard's own doc comment and migration `0190`'s doc comment for the full
 * isolation-preserving mechanism). Registered here, in the exact same
 * `APP_GUARD` list as `JwtAuthGuard`/`PermissionsGuard`/`AuthorityGuard`,
 * in the pipeline's documented position (second, right after `Jwt`).
 *
 * `AppConfigService`/`redisClientProvider` are NO LONGER declared as local
 * providers here — the `apps/api` composition root's `SharedInfraModule`
 * (`shared/infra/shared-infra.module.ts`, `@Global()`) now provides both
 * once for the whole app; see that file's doc comment for the full
 * consolidation write-up (this was one of several modules that used to
 * open its own redundant Redis connection).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UsrUserEntity,
      UsrSessionEntity,
      UsrLoginEventEntity,
      UsrPasswordHistoryEntity,
      UsrApiKeyEntity,
    ]),
  ],
  controllers: [AuthController, ApiKeysController],
  providers: [
    { provide: NOTIFICATION_PORT, useClass: LogOnlyAdapter },
    AuthUsrUserRepository,
    UsrSessionRepository,
    UsrLoginEventRepository,
    UsrPasswordHistoryRepository,
    UsrApiKeyRepository,
    PermissionResolutionRepository,
    AuthAuditLogRepository,
    JwtTokenService,
    OutboxWriterService,
    LockoutService,
    AuthService,
    TwoFactorService,
    OtpService,
    PasswordService,
    ApiKeyService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: LicenseStateGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: AuthorityGuard },
  ],
  exports: [AuthService, TwoFactorService, OtpService, PasswordService, ApiKeyService],
})
export class AuthModule {}

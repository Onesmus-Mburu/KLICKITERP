import { Module, ValidationPipe } from "@nestjs/common";
import { APP_FILTER, APP_PIPE } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  AppDataSource,
  AllExceptionsFilter,
  SharedInfraModule,
  AuthModule,
  UsersModule,
  SettingsModule,
  FilesModule,
  BrandingModule,
  CommsModule,
  ApprovalsModule,
  AccountingModule,
  StudentsModule,
  BillingModule,
  PaymentsModule,
  WalletModule,
  ProcurementModule,
  InventoryModule,
  ExpensesModule,
  PayrollModule,
  BankingModule,
  FixedAssetsModule,
  ReportingModule,
  IntegrationsModule,
  BackupsOpsModule,
  LicensingModule,
} from "@klickit/server";
// Reused directly, not forked/duplicated — see this class's own doc comment
// for the full rationale, and this file's doc comment below for why a
// relative cross-app import is the right call here (established precedent:
// `tools/bootstrap-admin.ts` already does the same thing for `AppModule`).
import { HealthController } from "../../api/src/health.controller";
import { OutboxQueueModule } from "./outbox/outbox-queue.module";

/**
 * `apps/worker`'s composition root — ADR-003's other half
 * (docs/phase-3/01-system-architecture.md §2.1: "Same image, two
 * entrypoints: `main.api.ts` ... and `main.worker.ts` (BullMQ processors +
 * cron) ... Both processes share modules; processors live beside their
 * module's services"). Deliberately mirrors `apps/api/src/app.module.ts`
 * almost verbatim: same `TypeOrmModule.forRoot()` pattern reusing
 * `AppDataSource.options.entities`/`.namingStrategy` (never hand-retyped),
 * same APP-role (`kfe_app`) DB credentials, never `DB_MIGRATION_USER`, same
 * `SharedInfraModule` import, and the same all-22-module import list from
 * `@klickit/server`'s barrel — this process needs every module's DI graph
 * available too, since a future real BullMQ processor living "beside its
 * module's services" (e.g. `domains/billing/jobs/billing-bulk.processor.ts`,
 * not built in this pass — see this app's own doc comment on scope) would
 * need that module's services injectable in THIS process, not just
 * `apps/api`'s.
 *
 * Two differences from `apps/api/src/app.module.ts`:
 * 1. `OutboxQueueModule` (this app's own, `./outbox/outbox-queue.module.ts`)
 *    replaces Swagger/CORS/global-prefix concerns `apps/api` owns instead —
 *    this process has no REST surface to document. It wires the one real
 *    new piece of infrastructure this pass builds: a generic
 *    `OutboxDispatcherService` (from `@klickit/server`, `shared/events/`)
 *    polled on a real BullMQ repeatable job.
 * 2. `HealthController` is `apps/api/src/health.controller.ts` itself,
 *    imported by relative path — NOT forked/duplicated. `apps/worker` has
 *    no exported library surface for `apps/api` to depend on (same
 *    situation `tools/bootstrap-admin.ts` already documented for importing
 *    `AppModule` this same way), so this is a plain cross-package
 *    TypeScript source import, made to type-check via this package's own
 *    `tsconfig.json` setting `rootDir` to the monorepo root (mirroring
 *    `tools/tsconfig.json`'s identical trick). The two `/health`/
 *    `/health/ready` routes behave IDENTICALLY to `apps/api`'s — same real
 *    DB `SELECT 1` + Redis `PING` probes, same response shape — because
 *    it's the literal same class, not a re-implementation that could drift.
 */
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: "postgres",
      host: process.env.DB_HOST ?? "localhost",
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USER ?? "kfe_app",
      password: process.env.DB_PASSWORD ?? "changeme",
      database: process.env.DB_NAME ?? "klickit_dev",
      schema: "app",
      ssl: process.env.DB_SSL === "true",
      namingStrategy: AppDataSource.options.namingStrategy,
      entities: AppDataSource.options.entities,
      synchronize: false,
      migrationsRun: false,
    }),
    SharedInfraModule,
    // Module 1
    AuthModule,
    UsersModule,
    // Module 2
    SettingsModule,
    // Module 3
    FilesModule,
    // Module 4
    BrandingModule,
    // Module 5
    CommsModule,
    // Module 6
    ApprovalsModule,
    // Module 7
    AccountingModule,
    // Module 8
    StudentsModule,
    // Module 9
    BillingModule,
    // Module 10
    PaymentsModule,
    // Module 11
    WalletModule,
    // Module 12
    ProcurementModule,
    // Module 13
    InventoryModule,
    // Module 14
    ExpensesModule,
    // Module 15
    PayrollModule,
    // Module 16
    BankingModule,
    // Module 17
    FixedAssetsModule,
    // Module 18
    ReportingModule,
    // Module 19
    IntegrationsModule,
    // Module 20
    BackupsOpsModule,
    // Module 21
    LicensingModule,
    // This app's own: outbox dispatcher + BullMQ wiring.
    OutboxQueueModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, transform: true }),
    },
  ],
})
export class AppModule {}

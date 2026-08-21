/**
 * `@klickit/server` package barrel — the composition surface `apps/api`
 * (and, later, `apps/worker`) import against. Did not exist before the
 * `apps/api` composition-root pass: every one of this package's 22 module
 * classes (Module 1's `AuthModule`+`UsersModule` through Module 21's
 * `LicensingModule`) was built and tested as an importable NestJS library
 * module, but nothing outside this package's own tests ever imported them
 * — `package.json`'s `"main": "dist/index.js"`/`"types": "dist/index.d.ts"`
 * fields existed from day one but pointed at a file that had never been
 * written. This barrel fulfils that already-declared contract rather than
 * introducing a new one.
 *
 * Deliberately re-exports only what a composition root needs: the 22
 * module classes (architecture doc §4.1's `apps/api/src/app.module.ts`
 * import list), `AppDataSource` (so `TypeOrmModule.forRoot()` can reuse its
 * `entities`/`namingStrategy` verbatim instead of hand-retyping ~190
 * entities — see that constant's own doc comment; `apps/api` reads
 * `AppDataSource.options.entities`/`.namingStrategy` and supplies its own
 * APP-role connection credentials, never `AppDataSource` itself, per M-5
 * "never the app-boot role"), `AllExceptionsFilter` (the global
 * `APP_FILTER`), and the handful of shared-kernel symbols a bare
 * liveness/readiness health controller needs (`REDIS_CLIENT`, `Public`,
 * `ExemptFromLicenseGuard`). Application/infrastructure internals of any
 * module stay unexported here, same as they stay unexported from each
 * module's own local barrel/`crossSiblingImportPolicy` boundary.
 *
 * One deliberate, narrow exception (2026-07-28, "Installer Bootstrap"
 * pass): `UsersService`/`RolesService`/`AuthService`/`PasswordService`/
 * `TwoFactorService` are also exported below, so `tools/bootstrap-admin.ts`
 * -- a one-shot `NestFactory.createApplicationContext(AppModule)` CLI, not
 * an HTTP consumer -- can `app.get()` the exact same DI-wired service
 * instances the running app would construct, instead of reimplementing
 * bcrypt/2FA/session logic by hand or reaching for raw SQL. This is still
 * *services only*, never repositories -- the "repositories never leave
 * their module" rule (see `UsersModule`/`AuthModule`'s own doc comments)
 * stays intact; where the CLI needed a lookup only a repository exposed
 * (username -> id, "who holds this role"), a small new method was added to
 * the already-exported `UsersService`/`RolesService` instead of exporting
 * the repository itself. See `docs/phase-5/PROGRESS.md`'s "Installer
 * Bootstrap" section for the full rationale.
 */

// Module 1
export { AuthModule } from "./platform/auth/auth.module";
export { UsersModule } from "./platform/users/users.module";
// Module 1 — application services, exported for `tools/bootstrap-admin.ts`
// only (see this file's doc comment above for the full rationale).
export { UsersService } from "./platform/users/application/users.service";
export type { CreateUserInput, CreateUserResult } from "./platform/users/application/users.service";
export { RolesService } from "./platform/users/application/roles.service";
export { AuthService } from "./platform/auth/application/auth.service";
export type { LoginOutcome, PublicUser } from "./platform/auth/application/auth.service";
export { PasswordService } from "./platform/auth/application/password.service";
export { TwoFactorService } from "./platform/auth/application/two-factor.service";
export type { EnrollResult, ActivateResult } from "./platform/auth/application/two-factor.service";
// Module 2
export { SettingsModule } from "./platform/settings/settings.module";
// Module 3
export { FilesModule } from "./platform/files/files.module";
// Module 4
export { BrandingModule } from "./platform/branding/branding.module";
// Module 5
export { CommsModule } from "./platform/comms/comms.module";
// Module 6
export { ApprovalsModule } from "./platform/approvals/approvals.module";
// Module 7
export { AccountingModule } from "./accounting/accounting.module";
// Module 8
export { StudentsModule } from "./domains/students/students.module";
// Module 9
export { BillingModule } from "./domains/billing/billing.module";
// Module 10
export { PaymentsModule } from "./domains/payments/payments.module";
// Module 11
export { WalletModule } from "./domains/wallet/wallet.module";
// Module 12
export { ProcurementModule } from "./domains/procurement/procurement.module";
// Module 13
export { InventoryModule } from "./domains/inventory/inventory.module";
// Module 14
export { ExpensesModule } from "./domains/expenses/expenses.module";
// Module 15
export { PayrollModule } from "./domains/payroll/payroll.module";
// Module 16
export { BankingModule } from "./domains/banking/banking.module";
// Module 17
export { FixedAssetsModule } from "./domains/fixed-assets/fixed-assets.module";
// Module 18
export { ReportingModule } from "./domains/reporting/reporting.module";
// Module 19
export { IntegrationsModule } from "./domains/integrations/integrations.module";
// Module 20
export { BackupsOpsModule } from "./domains/backups-ops/backups-ops.module";
// Module 21
export { LicensingModule } from "./licensing/licensing.module";

// Phase 6 Slice 16 (Part 1 — Document Security: Watermark + QR
// Verification backend) — a new small platform module added after the
// original 21 phase-5 modules, exported here the same way every one of them
// is (composition-root needs it directly for `DocumentVerificationController`'s
// public `GET /document-verification/:token` route to be reachable
// regardless of module-import ordering, even though `PaymentsModule`/
// `BillingModule` also import it transitively for `DocumentVerificationService`).
export { DocumentVerificationModule } from "./platform/document-verification/document-verification.module";

// Shared kernel / cross-cutting — composition-root needs only.
export { SharedInfraModule } from "./shared/infra/shared-infra.module";
export { AppConfigService } from "./shared/config/app-config.service";
export { REDIS_CLIENT, redisClientProvider } from "./shared/cache/redis.provider";
export { AllExceptionsFilter } from "./shared/exceptions/all-exceptions.filter";
export { Public } from "./shared/rbac/public.decorator";
export { ExemptFromLicenseGuard } from "./shared/rbac/exempt-from-license-guard.decorator";

// Outbox dispatcher (2026-07-28, "apps/worker" pass) — `apps/worker`'s
// composition root imports `OutboxDispatcherModule` alongside the 22
// domain/platform modules above, then a worker-local BullMQ processor
// resolves `OutboxDispatcherService` and calls `pollOnce()` on a repeatable
// schedule. See `shared/events/outbox-dispatcher.service.ts`'s own doc
// comment for the full dispatch mechanics and `docs/phase-5/PROGRESS.md`'s
// "apps/worker" section for the build/verification write-up.
export { OutboxDispatcherModule } from "./shared/events/outbox-dispatcher.module";
export { OutboxDispatcherService } from "./shared/events/outbox-dispatcher.service";
export type { OutboxPollResult } from "./shared/events/outbox-dispatcher.service";
export { OUTBOX_HANDLERS } from "./shared/events/outbox-handler.interface";
export type { OutboxHandler } from "./shared/events/outbox-handler.interface";
export type { DomainEvent } from "./shared/events/domain-event";

// Migration/entity source of truth — see this export's own usage note above.
export { AppDataSource } from "./migrations/data-source";

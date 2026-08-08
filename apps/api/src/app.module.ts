import { BadRequestException, Module } from "@nestjs/common";
import { APP_FILTER, APP_PIPE } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ValidationPipe } from "@nestjs/common";
import type { ValidationError } from "@nestjs/common";
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
  DocumentVerificationModule,
} from "@klickit/server";
import { HealthController } from "./health.controller";

/**
 * One `{field, message}` pair per failed class-validator constraint —
 * Phase 6 Slice 2b item 2a's structured-validation-error shape, consumed by
 * `apps/web/src/lib/api-error.ts`'s `parseFieldErrors()`.
 */
interface FieldError {
  field: string;
  message: string;
}

/**
 * Flattens class-validator's `ValidationError[]` tree into a flat
 * `{field, message}[]`, one entry per failed constraint (a property with two
 * failed constraints yields two entries, both under the same `field`).
 * `parentPath` accumulates dotted paths for nested DTOs
 * (`@ValidateNested()`, e.g. `line.amount`) and array items (class-validator
 * represents an array element's own errors as a `children` entry whose
 * `property` is the numeric index, so this naturally produces
 * `items.0.amount`-style paths) — checked against real DTOs in this
 * codebase that DO use `@ValidateNested()` (e.g. `PostJournalDto`'s
 * `lines`), so this is handling a real case, not speculative
 * over-engineering.
 */
function flattenValidationErrors(errors: ValidationError[], parentPath = ""): FieldError[] {
  const fields: FieldError[] = [];
  for (const error of errors) {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;
    if (error.constraints) {
      for (const message of Object.values(error.constraints)) {
        fields.push({ field: path, message });
      }
    }
    if (error.children && error.children.length > 0) {
      fields.push(...flattenValidationErrors(error.children, path));
    }
  }
  return fields;
}

/**
 * `apps/api`'s composition root (docs/phase-3/01-system-architecture.md
 * §4.1). Imports all 22 module classes from `@klickit/server`'s barrel —
 * one per Phase 5 module, except Module 1 which contributes two
 * (`AuthModule` + `UsersModule`) — plus a root `TypeOrmModule.forRoot()`
 * and the two global cross-cutting providers (`AllExceptionsFilter`,
 * `ValidationPipe`) docs/phase-3/01 §5 names.
 *
 * `TypeOrmModule.forRoot()` deliberately does NOT construct a second,
 * hand-typed `entities`/`namingStrategy` pair — it reads
 * `AppDataSource.options.entities`/`.namingStrategy` from
 * `packages/server/src/migrations/data-source.ts` (imported, never
 * retyped, per this task's own explicit instruction), the authoritative
 * list of every TypeORM entity in this codebase (~190 entities).
 * `AppDataSource` itself is never `.initialize()`'d or connected to here —
 * only its static `options` object is read — and this connection uses the
 * APP role (`DB_USER`/`DB_PASSWORD`, `kfe_app`, DML-only), never
 * `DB_MIGRATION_USER`/`kfe_migrate` (DDL-only, migrations only — never at
 * app boot, per M-5, docs/phase-4/01-standards-and-migrations.md).
 *
 * `SharedInfraModule` is imported once, here, at the root — it is
 * `@Global()`, so every one of the 22 modules below (several of which used
 * to each declare their own local, redundant `AppConfigService`/
 * `redisClientProvider`) now shares one `AppConfigService` instance and one
 * live Redis connection instead of up to 6/4 respectively. See that
 * module's own doc comment (`packages/server/src/shared/infra/shared-infra.module.ts`)
 * for the full consolidation write-up.
 *
 * `AuthModule` (imported below, part of Module 1) already registers
 * `JwtAuthGuard`/`LicenseStateGuard`/`PermissionsGuard`/`AuthorityGuard` as
 * global `APP_GUARD` providers in the exact pipeline order
 * docs/phase-3/02-communication-authentication.md §2.3 documents — this
 * file does NOT re-register or duplicate that pipeline, it is wired
 * automatically the moment `AuthModule` is imported anywhere in the module
 * tree.
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
    // Module 21 — structurally isolated (module-deps.json "importableBy": []);
    // imported here at the composition root like every other module — the
    // isolation rule constrains what LICENSING may import, not who may import it.
    LicensingModule,
    // Phase 6 Slice 16 (Part 1) — a new small platform module, not one of
    // the original 21 phase-5 modules. `PaymentsModule`/`BillingModule` also
    // import it (for `DocumentVerificationService`), but it's registered
    // here too, explicitly, so its public `GET /document-verification/:token`
    // route is reachable regardless of those two modules' own import order —
    // NestJS module singletons make importing the same module from multiple
    // places safe (confirmed against this codebase's own precedent: `FilesModule`
    // is both a direct root import AND imported by `BrandingModule`).
    DocumentVerificationModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    {
      provide: APP_PIPE,
      // Phase 6 Slice 2b item 2a: a custom `exceptionFactory` maps
      // class-validator's ValidationError[] into `{field, message}[]` on a
      // `fields` key of the thrown BadRequestException's response body.
      // `AllExceptionsFilter.mapException()` already forwards any
      // HttpException's whole response body verbatim as `error.details`
      // when it's an object (see that filter's own `details: typeof body
      // === "object" ? body : undefined` line) — so this alone is enough to
      // make every DTO in the app return `error.details.fields` on a
      // validation failure, with zero change needed to the filter itself.
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: (errors: ValidationError[]) =>
          new BadRequestException({
            statusCode: 400,
            error: "Bad Request",
            message: "Validation failed",
            fields: flattenValidationErrors(errors),
          }),
      }),
    },
  ],
})
export class AppModule {}

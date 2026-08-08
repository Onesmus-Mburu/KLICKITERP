import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DocumentVerificationService } from "./application/document-verification.service";
import { DocumentVerificationController } from "./api/document-verification.controller";
import { DocvRecordEntity } from "./domain/docv-record.entity";
import { DocvRecordRepository } from "./infrastructure/docv-record.repository";

/**
 * Phase 6 Slice 16 (Part 1 — Document Security: Watermark + QR Verification
 * backend). A fully generic platform module — `module-deps.json`'s
 * `platform/document-verification.mayImport` is `["shared", "platform/auth"]`
 * — `platform/auth` is listed purely for `DocumentVerificationController`'s
 * use of the `@Public()` DECORATOR
 * (`platform/auth/infrastructure/guards/public.decorator.ts`, a pure
 * `SetMetadata` call with no DI), imported directly by that controller file
 * (via `platform/auth`'s own index.ts barrel) only — same precedent
 * `domains/payments`' `MpesaController` and `platform/branding`'s
 * `ThemesController` already establish for their own public routes (see
 * each's own doc comment: "AuthModule itself is NOT imported here, only the
 * decorator function is imported directly"). This `@Module()`'s own
 * `imports` array below accordingly has no `AuthModule` entry — no DI
 * provider from `platform/auth` is ever actually needed here.
 *
 * No dependency on branding/users/any domain module: any document-producing
 * service composes against this module's exported
 * `DocumentVerificationService` inside its OWN transaction (`mint()`), the
 * same composability convention `platform/settings`' `NumberingService
 * .allocate(em, ...)` established — `domains/payments`/`domains/billing` are
 * the first two documented consumers.
 */
@Module({
  imports: [TypeOrmModule.forFeature([DocvRecordEntity])],
  controllers: [DocumentVerificationController],
  providers: [DocvRecordRepository, DocumentVerificationService],
  exports: [DocumentVerificationService],
})
export class DocumentVerificationModule {}

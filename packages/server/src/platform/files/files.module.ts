import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { TypeOrmModule } from "@nestjs/typeorm";
import { memoryStorage } from "multer";
import { AppConfigService } from "../../shared/config/app-config.service";
import { OutboxWriterService } from "../../shared/events/outbox-writer.service";
import { FilesService } from "./application/files.service";
import { FilesController } from "./api/files.controller";
import { FileObjectEntity } from "./domain/file-object.entity";
import { FileObjectRepository } from "./infrastructure/file-object.repository";
import { MinioStorageAdapter } from "./infrastructure/minio-storage.adapter";
import { STORAGE_PORT } from "./infrastructure/storage.port";

/**
 * `MulterModule` is configured here with in-memory storage (a `Buffer`, not
 * an on-disk temp file) — `FilesService` persists the upload straight to
 * MinIO itself, so there's no disk intermediate to manage/clean up.
 * Multer's `limits.fileSize` is an early, cheap reject (before the request
 * body even finishes buffering); `FilesService.assertUploadAllowed` stays
 * the source of truth for the actual `ValidationException` raised to the
 * caller, since Multer's own limit violation surfaces as a raw framework
 * error instead of this module's error envelope.
 *
 * `AppConfigService` is no longer a local `providers` entry — the
 * `apps/api` composition root's `SharedInfraModule`
 * (`shared/infra/shared-infra.module.ts`, `@Global()`) now provides it once
 * for the whole app; the `import` above stays because `MulterModule
 * .registerAsync`'s factory still needs the type for `inject: [AppConfigService]`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([FileObjectEntity]),
    MulterModule.registerAsync({
      useFactory: (config: AppConfigService) => ({
        storage: memoryStorage(),
        limits: { fileSize: config.fileMaxUploadBytes },
      }),
      inject: [AppConfigService],
    }),
  ],
  controllers: [FilesController],
  providers: [
    OutboxWriterService,
    FileObjectRepository,
    { provide: STORAGE_PORT, useClass: MinioStorageAdapter },
    FilesService,
  ],
  // `STORAGE_PORT` is exported alongside `FilesService` starting with Module 20
  // (Backups/Ops) — the one-directional cross-module grant precedent every
  // prior module has used (e.g. `platform/auth` exporting `AuthService`/etc.
  // via its barrel), extended here specifically so `BackupOrchestratorService`/
  // `RestoreVerificationService` can inject the SAME MinIO-backed `StoragePort`
  // this module already wires up (backup archive upload/delete to the
  // `backups` bucket) rather than duplicating a second `MinioStorageAdapter`
  // registration. The barrel (`index.ts`) already exported the `STORAGE_PORT`
  // symbol/type at the TS level; this `exports` array entry is what actually
  // makes the DI *provider* resolvable by an importing module — a TS export
  // alone does not do that in Nest. `platform/files` still exports nothing
  // else new; `FileObjectRepository`/`MinioStorageAdapter` internals stay
  // module-private per `crossSiblingImportPolicy`.
  exports: [FilesService, STORAGE_PORT],
})
export class FilesModule {}

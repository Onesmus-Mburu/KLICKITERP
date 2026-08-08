import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OutboxWriterService } from "../../shared/events/outbox-writer.service";
import { FilesModule } from "../files";
import { ThemesService } from "./application/themes.service";
import { ThemesController } from "./api/themes.controller";
import { BrndThemeEntity } from "./domain/brnd-theme.entity";
import { BrndThemeRepository } from "./infrastructure/brnd-theme.repository";

/**
 * Exports only `ThemesService` (the module's public surface) per the module
 * anatomy rule — `BrndThemeRepository` never leaves this module.
 *
 * Imports `FilesModule` (Slice 14 Part 3) so `ThemesService` can inject the
 * exported `FilesService` and resolve `logoUrl`/`faviconUrl`/
 * `loginBackgroundImageUrl` signed URLs in-process — `module-deps.json`'s
 * `platform/branding.mayImport` already lists `platform/files`, and
 * `platform/files` has no dependency back on `platform/branding`, so this
 * introduces no circularity.
 */
@Module({
  imports: [TypeOrmModule.forFeature([BrndThemeEntity]), FilesModule],
  controllers: [ThemesController],
  providers: [BrndThemeRepository, ThemesService, OutboxWriterService],
  exports: [ThemesService],
})
export class BrandingModule {}

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OutboxWriterService } from "../../shared/events/outbox-writer.service";
import { SetSettingEntity } from "./domain/set-setting.entity";
import { SetAcademicYearEntity } from "./domain/set-academic-year.entity";
import { SetTermEntity } from "./domain/set-term.entity";
import { SetNumberingSeriesEntity } from "./domain/set-numbering-series.entity";
import { SetIntegrationConfigEntity } from "./domain/set-integration-config.entity";
import { SetCustomFieldDefEntity } from "./domain/set-custom-field-def.entity";
import { SetSettingRepository } from "./infrastructure/set-setting.repository";
import { SetAcademicYearRepository } from "./infrastructure/set-academic-year.repository";
import { SetTermRepository } from "./infrastructure/set-term.repository";
import { SetNumberingSeriesRepository } from "./infrastructure/set-numbering-series.repository";
import { SetIntegrationConfigRepository } from "./infrastructure/set-integration-config.repository";
import { SetCustomFieldDefRepository } from "./infrastructure/set-custom-field-def.repository";
import { SettingsService } from "./application/settings.service";
import { AcademicCalendarService } from "./application/academic-calendar.service";
import { NumberingService } from "./application/numbering.service";
import { IntegrationConfigService } from "./application/integration-config.service";
import { CustomFieldService } from "./application/custom-field.service";
import { SettingsController } from "./api/settings.controller";
import { AcademicCalendarController } from "./api/academic-calendar.controller";
import { NumberingController } from "./api/numbering.controller";
import { IntegrationConfigsController } from "./api/integration-configs.controller";
import { CustomFieldsController } from "./api/custom-fields.controller";

/**
 * Exports ONLY the application services (the module's public surface) per
 * the module anatomy rule (architecture doc §4.2) — repositories never
 * leave their module. `NumberingService` is the one export every later
 * revenue/expense module (billing, payments, procurement, payroll, ...)
 * will depend on for `allocate()`; those modules reach it only through
 * this barrel (`index.ts`), never `application/numbering.service` directly,
 * per `crossSiblingImportPolicy` in module-deps.json.
 *
 * `AppConfigService` is no longer a local `providers` entry — the
 * `apps/api` composition root's `SharedInfraModule`
 * (`shared/infra/shared-infra.module.ts`, `@Global()`) now provides it once
 * for the whole app.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SetSettingEntity,
      SetAcademicYearEntity,
      SetTermEntity,
      SetNumberingSeriesEntity,
      SetIntegrationConfigEntity,
      SetCustomFieldDefEntity,
    ]),
  ],
  controllers: [
    SettingsController,
    AcademicCalendarController,
    NumberingController,
    IntegrationConfigsController,
    CustomFieldsController,
  ],
  providers: [
    SetSettingRepository,
    SetAcademicYearRepository,
    SetTermRepository,
    SetNumberingSeriesRepository,
    SetIntegrationConfigRepository,
    SetCustomFieldDefRepository,
    SettingsService,
    AcademicCalendarService,
    NumberingService,
    IntegrationConfigService,
    CustomFieldService,
    OutboxWriterService,
  ],
  exports: [SettingsService, AcademicCalendarService, NumberingService, IntegrationConfigService, CustomFieldService],
})
export class SettingsModule {}

/**
 * Public barrel — the only surface any future sibling module should import
 * from (`crossSiblingImportPolicy` in module-deps.json). Re-exports the
 * module class, its public services, and the domain entities/types other
 * modules may need to reference by shape (e.g. `SetIntegrationKind`).
 */
export { SettingsModule } from "./settings.module";
export { SettingsService } from "./application/settings.service";
export { AcademicCalendarService } from "./application/academic-calendar.service";
export { NumberingService } from "./application/numbering.service";
export { IntegrationConfigService } from "./application/integration-config.service";
export { CustomFieldService } from "./application/custom-field.service";

export { SetSettingEntity } from "./domain/set-setting.entity";
export { SetAcademicYearEntity } from "./domain/set-academic-year.entity";
export { SetTermEntity } from "./domain/set-term.entity";
export { SetNumberingSeriesEntity, NUMBERING_SERIES_NEVER_PERIOD_KEY } from "./domain/set-numbering-series.entity";
export type { SetNumberingResetPolicy } from "./domain/set-numbering-series.entity";
export { SetIntegrationConfigEntity } from "./domain/set-integration-config.entity";
export type { SetIntegrationKind } from "./domain/set-integration-config.entity";
export { SetCustomFieldDefEntity } from "./domain/set-custom-field-def.entity";
export type { SetCustomFieldEntityType, SetCustomFieldType } from "./domain/set-custom-field-def.entity";

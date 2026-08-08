/**
 * Canonical shapes of `brnd_theme.login_config` and `brnd_theme.document_config`
 * (FR-BRND-002.1 "Login page" / "Documents" branding-studio sections). Both
 * columns are opaque jsonb at the entity layer (`BrndThemeEntity.loginConfig`
 * / `.documentConfig: unknown`, matching `SetSettingEntity.value`'s
 * convention) — these interfaces are the single source of truth for what's
 * actually inside that jsonb, mirrored 1:1 by the DTO layer
 * (`api/dto/login-config.dto.ts`, `api/dto/document-config.dto.ts`).
 */
export interface ThemeLoginConfig {
  /** `file_object.id` of the login page background image, if set. */
  backgroundImageFileId?: string | null;
  welcomeText?: string | null;
}

export interface ThemeDocumentConfig {
  headerText?: string | null;
  footerText?: string | null;
  watermarkText?: string | null;
  /** `file_object.id[]` — signature images usable on invoices/receipts/reports. */
  signatureFileIds?: string[];
}

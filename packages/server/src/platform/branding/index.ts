/**
 * Public barrel — the only surface any future sibling module should import
 * from (`crossSiblingImportPolicy` in module-deps.json).
 */
export { BrandingModule } from "./branding.module";
export { ThemesService } from "./application/themes.service";
export type { CreateThemeInput, ResolvedThemeBundle, UpdateThemeInput } from "./application/themes.service";
export { buildThemeCssVariables } from "./application/theme-tokens.util";
export type {
  ThemeColorTokens,
  ThemeRadiusTokens,
  ThemeSpacingTokens,
  ThemeTokens,
} from "./application/theme-tokens.util";
export type { ThemeDocumentConfig, ThemeLoginConfig } from "./application/theme-config.types";
export {
  INFONEY_DEFAULT_DOCUMENT_CONFIG,
  INFONEY_DEFAULT_LOGIN_CONFIG,
  INFONEY_DEFAULT_THEME_NAME,
  INFONEY_DEFAULT_THEME_TOKENS,
} from "./application/infoney-default-theme";

export { BrndThemeEntity } from "./domain/brnd-theme.entity";
export type { BrndThemeStatus } from "./domain/brnd-theme.entity";

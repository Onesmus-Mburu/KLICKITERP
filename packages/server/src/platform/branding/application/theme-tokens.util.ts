/**
 * Canonical shape of `brnd_theme.tokens` (FR-BRND-001.1). The entity column
 * itself stores this as opaque jsonb (`BrndThemeEntity.tokens: unknown`,
 * matching `SetSettingEntity.value`'s convention) — this interface, and the
 * pure `buildThemeCssVariables` assembler below, are the single source of
 * truth for what's actually inside that jsonb, shared by the DTO layer
 * (`api/dto/theme-tokens.dto.ts`, which mirrors this shape 1:1 for
 * class-validator/Swagger), `ThemesService`, and the Infoney seed defaults
 * (`domain/infoney-default-theme.ts`).
 */
export interface ThemeColorTokens {
  /** `--color-primary` — Infoney default: Deep Purple #573399. */
  primary: string;
  /** `--color-secondary` — Infoney default: Bright Yellow #FBF80D. */
  secondary: string;
  /** `--color-accent` — Infoney default: Gold/Orange #CFA22D. */
  accent: string;
  /** `--color-primary-light` — Infoney default: Light Purple #9371F8. */
  primaryLight: string;
  /** `--color-primary-soft` — Infoney default: Soft Purple #A972FA. */
  primarySoft: string;
  /** `--color-primary-lavender` — Infoney default: Lavender #CCACF4. */
  primaryLavender: string;
  /** `--color-surface` — Infoney default: white/surface #FDFDFE. */
  surface: string;
  /** `--color-dark` — Infoney default: dark purple #341E40. */
  dark: string;
  /** `--color-black` — Infoney default: #000000. */
  black: string;
}

export interface ThemeRadiusTokens {
  sm: string;
  md: string;
  lg: string;
  xl: string;
}

/** FR-BRND-001.1 spacing scale — Infoney default is the 4/8/12/16/24/32/48 px scale. */
export interface ThemeSpacingTokens {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  xxl: string;
  xxxl: string;
}

export interface ThemeTokens {
  colors: ThemeColorTokens;
  fontFamily: string;
  radius: ThemeRadiusTokens;
  spacing: ThemeSpacingTokens;
}

/**
 * Assembles the CSS-variable-shaped output (`--color-primary` etc., FR-BRND-001.1)
 * from a theme's `tokens` jsonb. Pure and side-effect-free by design — used
 * by both the public `GET /branding/theme/current` endpoint and, later,
 * server-side PDF rendering (documents read the same token set, per the
 * requirement). Returns a flat map of CSS custom-property name -> value so
 * callers can either serialize it straight into a `:root { ... }` block or
 * pass it to a PDF template engine as-is.
 */
export function buildThemeCssVariables(tokens: ThemeTokens): Record<string, string> {
  return {
    "--color-primary": tokens.colors.primary,
    "--color-secondary": tokens.colors.secondary,
    "--color-accent": tokens.colors.accent,
    "--color-primary-light": tokens.colors.primaryLight,
    "--color-primary-soft": tokens.colors.primarySoft,
    "--color-primary-lavender": tokens.colors.primaryLavender,
    "--color-surface": tokens.colors.surface,
    "--color-dark": tokens.colors.dark,
    "--color-black": tokens.colors.black,
    "--font-family": tokens.fontFamily,
    "--radius-sm": tokens.radius.sm,
    "--radius-md": tokens.radius.md,
    "--radius-lg": tokens.radius.lg,
    "--radius-xl": tokens.radius.xl,
    "--spacing-xs": tokens.spacing.xs,
    "--spacing-sm": tokens.spacing.sm,
    "--spacing-md": tokens.spacing.md,
    "--spacing-lg": tokens.spacing.lg,
    "--spacing-xl": tokens.spacing.xl,
    "--spacing-xxl": tokens.spacing.xxl,
    "--spacing-xxxl": tokens.spacing.xxxl,
  };
}

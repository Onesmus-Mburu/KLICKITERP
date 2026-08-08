import { ThemeDocumentConfig, ThemeLoginConfig } from "./theme-config.types";
import { ThemeTokens } from "./theme-tokens.util";

/**
 * Single source of truth for the Infoney Solutions default brand palette.
 *
 * Palette per the OFFICIAL Infoney Solutions Brand Guidelines PDF (color
 * table, p.7/8): primary Deep Purple #573399; secondary Bright Yellow
 * #FBF80D (gamification/interactive elements); accent/CTA Orange #FBB03B
 * ("Enthusiasm, energy, motivation" — the swatch the guide explicitly
 * labels as the accent/CTA colour); supporting Light Purple #9371F8 / Soft
 * Purple #A972FA / Lavender Tint #CCACF4; white/surface #FDFDFE; dark
 * purple/charcoal #341E40; black #000000; font Poppins.
 *
 * Gold #CFA22D is a SEPARATE brand swatch in the same PDF — NOT the
 * accent/CTA colour — and is currently unused anywhere in this codebase.
 * "Very Light Lavender" #D3C4FE is a further brand swatch also currently
 * unused (no `ThemeTokens` field maps to it yet).
 *
 * 2026-07-28 correction (docs/phase-6/PROGRESS.md Slice 1.5c): `colors.accent`
 * was `#CFA22D` (Gold) — conflating it with Orange in an earlier doc comment
 * ("Gold/Orange #CFA22D") as if they were one swatch. They are not: the
 * brand PDF lists Orange #FBB03B and Gold #CFA22D as two distinct entries,
 * and only Orange is designated the accent/CTA colour. Every other value in
 * this file was independently re-checked against the same PDF and already
 * matched exactly. Corrected `colors.accent` to `#FBB03B` to match the
 * authoritative brand document. If this ever needs reverting, it's this one
 * line + its `apps/web/src/styles/tokens.css` `--color-accent` mirror.
 *
 * Consumed by TWO independent places that must never drift apart:
 *  1. `ThemesService.getCurrentTheme()`'s hardcoded fallback bundle, needed
 *     at boot before any seed migration has run (or in an environment that
 *     never got Docker/Postgres — see docs/phase-5/PROGRESS.md).
 *  2. Migration `0900-seed-permissions-and-roles.ts`, which upserts one
 *     PUBLISHED `brnd_theme` row named `INFONEY_DEFAULT_THEME_NAME` from
 *     these exact values, but ONLY on first seed (idempotent, natural-key,
 *     insert-only-if-absent — see that migration's `seedDefaultTheme()`).
 *     An environment that already ran this migration before this correction
 *     has a `brnd_theme` DB row baked with the OLD `#CFA22D` value that this
 *     constant change alone will NOT retroactively fix (the migration never
 *     re-runs/updates an existing row) — that already-seeded row needs its
 *     own one-time direct data correction, done separately from this file.
 *
 * Radius scale (sm/md/lg/xl) and spacing scale (4/8/12/16/24/32/48 px) are
 * this module's own sensible defaults for a modern enterprise UI — the task
 * brief left them open ("sensible ... defaults"), the palette/font did not.
 */
export const INFONEY_DEFAULT_THEME_NAME = "Infoney Default";

export const INFONEY_DEFAULT_THEME_TOKENS: ThemeTokens = {
  colors: {
    primary: "#573399",
    secondary: "#FBF80D",
    // Orange — the brand PDF's real accent/CTA colour (2026-07-28 fix; was
    // #CFA22D, the Gold swatch — see this file's top doc comment).
    accent: "#FBB03B",
    primaryLight: "#9371F8",
    primarySoft: "#A972FA",
    primaryLavender: "#CCACF4",
    surface: "#FDFDFE",
    dark: "#341E40",
    black: "#000000",
  },
  fontFamily: "Poppins, sans-serif",
  radius: {
    sm: "4px",
    md: "8px",
    lg: "16px",
    xl: "24px",
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "24px",
    xxl: "32px",
    xxxl: "48px",
  },
};

export const INFONEY_DEFAULT_LOGIN_CONFIG: ThemeLoginConfig = {
  backgroundImageFileId: null,
  welcomeText: "Welcome to Klickit Finance ERP",
};

export const INFONEY_DEFAULT_DOCUMENT_CONFIG: ThemeDocumentConfig = {
  headerText: "Infoney Solutions",
  footerText: null,
  watermarkText: null,
  signatureFileIds: [],
};

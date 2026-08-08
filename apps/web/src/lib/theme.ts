import type { CurrentThemeResponseDto } from "@klickit/contracts";
import { flipForDarkMode, mixHex } from "./theme-colors";

/**
 * Semantic (shadcn/ui-style) CSS variable names, built from the real
 * `ThemeTokens` field names in `GET /branding/theme/current`'s `tokens`
 * object (never hand-retyped — see `infoney-default-theme.ts`'s own field
 * names: colors.{primary,secondary,accent,primaryLight,primarySoft,
 * primaryLavender,surface,dark,black}). shadcn conventionally wraps these
 * in `hsl(var(--x))`; this app's tokens arrive as hex from the backend, so
 * the raw hex is used directly as each variable's value instead (valid CSS
 * anywhere a color is accepted) — documented deviation from the shadcn
 * default, noted once here rather than at every call site.
 */
export function buildSemanticLightVariables(theme: CurrentThemeResponseDto): Record<string, string> {
  const { colors } = theme.tokens;
  return {
    // Slice 1.5 fix (docs/phase-6/PROGRESS.md): light mode used to set
    // `--background` to the IDENTICAL `colors.surface` value as `--card`,
    // the literal cause of the "flat, no elevation" look the redesign
    // feedback called out — a white card on a white canvas has nowhere to
    // cast a visible shadow/edge. Mirrors dark mode's already-correct
    // pattern just below (`background` darkest, `card` a step lighter):
    // here `--background` is `colors.surface` mixed 3% toward `colors.dark`
    // (a barely-there warm-gray canvas), `--card` stays the pure
    // `colors.surface` white, elevated visibly above it. 3% was eyeballed
    // against real SSR output as enough to read as a distinct canvas
    // without tinting the page enough to look "off-white/dirty."
    "--background": mixHex(colors.surface, colors.dark, 0.03),
    "--foreground": colors.dark,
    "--card": colors.surface,
    "--card-foreground": colors.dark,
    "--popover": colors.surface,
    "--popover-foreground": colors.dark,
    "--primary": colors.primary,
    "--primary-foreground": colors.surface,
    "--secondary": colors.secondary,
    "--secondary-foreground": colors.dark,
    "--accent": colors.accent,
    "--accent-foreground": colors.dark,
    "--muted": mixHex(colors.surface, colors.dark, 0.06),
    "--muted-foreground": mixHex(colors.dark, colors.surface, 0.35),
    "--border": mixHex(colors.surface, colors.dark, 0.14),
    "--input": mixHex(colors.surface, colors.dark, 0.14),
    "--ring": colors.primary,
    "--destructive": "#DC2626",
    "--destructive-foreground": "#FFFFFF",
    "--success": "#16A34A",
    "--success-foreground": "#FFFFFF",
    "--warning": colors.accent,
    "--warning-foreground": colors.dark,
    "--radius": theme.tokens.radius.md,
    "--font-family": theme.tokens.fontFamily,
    // Raw brand tokens too, for spots that want the exact brand hue
    // (charts, the login screen) rather than a semantic role.
    ...theme.cssVariables,
  };
}

/**
 * Dark-mode counterpart, derived programmatically (flagged decision #5 —
 * no dark palette exists in `ThemeTokens`). `flipForDarkMode`'s
 * relative-luminance flip is the right tool for turning a LIGHT-mode
 * FOREGROUND color into one legible on a dark surface (dark text -> light
 * text), but it is the WRONG tool for a SURFACE color that is already dark
 * (`colors.dark`, the brand's own dark-purple token): flipping it would
 * LIGHTEN it toward white, which is backwards for a background/card
 * hierarchy (an earlier version of this function had exactly that bug —
 * `--background` came out lighter than `--card`, barely readable as "dark
 * mode" at all; caught during this slice's own live browser verification,
 * not left in). Surfaces below are instead built by DARKENING
 * `colors.dark` toward black by different amounts (`mixHex(..., "#000",
 * t)`), with `t` increasing in the order background > muted > card/popover
 * so the elevation hierarchy (background is the darkest, card/popover sit
 * "above" it) is correct by construction. `primary`/`secondary`/`accent`
 * use the palette's OWN lighter brand tokens (`primaryLight`) rather than a
 * mechanical flip of `primary`, since Infoney's palette already ships a
 * purpose-built lighter variant for exactly this on-dark usage. Status
 * colors (destructive/success) use fixed, conventional dark-theme-legible
 * steps rather than a luminance flip of their light-mode hex, for the same
 * "flip is for foregrounds, not deliberately-chosen status hues" reason.
 */
export function buildSemanticDarkVariables(theme: CurrentThemeResponseDto): Record<string, string> {
  const { colors } = theme.tokens;
  const darken = (t: number) => mixHex(colors.dark, "#000000", t);

  return {
    "--background": darken(0.55),
    "--foreground": colors.surface,
    "--card": darken(0.25),
    "--card-foreground": colors.surface,
    "--popover": darken(0.25),
    "--popover-foreground": colors.surface,
    "--primary": colors.primaryLight,
    "--primary-foreground": colors.black,
    "--secondary": colors.secondary,
    "--secondary-foreground": colors.black,
    "--accent": colors.accent,
    "--accent-foreground": colors.black,
    "--muted": darken(0.4),
    "--muted-foreground": mixHex(colors.surface, colors.dark, 0.3),
    "--border": mixHex(colors.dark, colors.surface, 0.3),
    "--input": mixHex(colors.dark, colors.surface, 0.3),
    "--ring": colors.primaryLight,
    "--destructive": "#F87171",
    "--destructive-foreground": "#1A0000",
    "--success": "#4ADE80",
    "--success-foreground": "#001A08",
    "--warning": flipForDarkMode(colors.accent, 0.15),
    "--warning-foreground": colors.black,
    "--radius": theme.tokens.radius.md,
    "--font-family": theme.tokens.fontFamily,
  };
}

export function toCssBlock(selector: string, vars: Record<string, string>): string {
  const body = Object.entries(vars)
    .map(([key, value]) => `${key}:${value};`)
    .join("");
  return `${selector}{${body}}`;
}

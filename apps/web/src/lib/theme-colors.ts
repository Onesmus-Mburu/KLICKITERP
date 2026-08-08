/**
 * Pure hex-color math used to derive a dark-mode palette from the single
 * light palette `GET /branding/theme/current` returns
 * (`packages/server/.../infoney-default-theme.ts` — `ThemeTokens` has no
 * dark-variant field at all, see docs/phase-6/PROGRESS.md "flagged
 * decisions" #5). No color library is pulled in for this — the monorepo's
 * own "don't add a dependency for something this small" convention (see
 * `Money`'s own from-scratch bigint decimal implementation) applies here
 * too; WCAG relative luminance is a ~10-line formula.
 *
 * Approach: for each SEMANTIC light-mode CSS variable (background,
 * foreground, card, border, ...), compute its WCAG relative luminance. A
 * "light" role (luminance > 0.5, e.g. a white surface) is flipped dark by
 * mixing it toward black; a "dark" role (luminance <= 0.5, e.g. dark-purple
 * text) is flipped light by mixing it toward white. This is a genuine
 * per-color luminance-driven flip, not a hardcoded light/dark pair table.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  const int = parseInt(full, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const toHex = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** WCAG 2.x relative luminance (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Linear-RGB mix of two hex colors; `t` in [0,1] is the weight toward `to`. */
export function mixHex(from: string, to: string, t: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

/**
 * Luminance-flip a single hex color for dark mode: light colors darken
 * toward black, dark colors lighten toward white. `amount` controls how far
 * the mix travels (0 = unchanged, 1 = pure black/white).
 */
export function flipForDarkMode(hex: string, amount = 0.82): string {
  const luminance = relativeLuminance(hex);
  return luminance > 0.5 ? mixHex(hex, "#000000", amount) : mixHex(hex, "#ffffff", amount);
}

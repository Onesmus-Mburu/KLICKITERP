/**
 * WCAG AA contrast checking for the theme editor's Colors section (Phase 6
 * Slice 14 Part 4). Reuses `relativeLuminance`/`mixHex` from
 * `lib/theme-colors.ts` — that file's own primitives were built for
 * dark-mode derivation, not contrast checking, but the underlying WCAG math
 * is identical, so no second implementation is warranted here.
 */

import { mixHex, relativeLuminance } from "@/lib/theme-colors";

/**
 * WCAG 2.x contrast ratio between two hex colors: `(L1 + 0.05) / (L2 + 0.05)`
 * where `L1` is the LIGHTER color's relative luminance and `L2` is the
 * darker one's. Always >= 1, regardless of argument order.
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const luminanceA = relativeLuminance(hexA);
  const luminanceB = relativeLuminance(hexB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG 2.1 AA threshold for NORMAL text specifically — 3.0 is the (looser)
 * large-text AA threshold, 7.0 is AAA. The pairs this module checks sit
 * behind regular badge/body text and button labels, not large headings, so
 * 4.5 is the correct bar, not a rounder-looking substitute.
 */
export const WCAG_AA_NORMAL_TEXT_THRESHOLD = 4.5;

export function meetsWcagAA(ratio: number): boolean {
  return ratio >= WCAG_AA_NORMAL_TEXT_THRESHOLD;
}

const SUGGESTION_STEP = 0.02;

/**
 * Finds the smallest visual nudge of `foreground` — toward black OR toward
 * white — that reaches AA contrast against `background`. Walks both
 * directions in lockstep in small steps and returns whichever direction
 * crosses the threshold at the SMALLER `t`, i.e. the least-disruptive fix
 * available, not just whichever direction happens to be tried first. If
 * both directions cross at the exact same step, the one with the higher
 * resulting ratio wins the tie.
 *
 * Guaranteed to terminate by `t = 1.0`: mixing pure black or white against
 * any background luminance `Lbg` reaches AA (ratio >= 4.5) whenever
 * `Lbg >= 0.175` (black) or `Lbg <= 0.1833` (white) — an overlapping pair of
 * conditions that covers every possible `Lbg` in `[0, 1]`, so at least one
 * direction always succeeds for a real hex background. The pure-black/white
 * fallback below is therefore unreachable in practice; it exists only as a
 * defensive last resort.
 */
export function suggestNearestCompliantColor(foreground: string, background: string): string {
  for (let t = SUGGESTION_STEP; t <= 1; t += SUGGESTION_STEP) {
    const towardBlack = mixHex(foreground, "#000000", t);
    const towardWhite = mixHex(foreground, "#ffffff", t);
    const blackRatio = contrastRatio(towardBlack, background);
    const whiteRatio = contrastRatio(towardWhite, background);
    const blackCompliant = meetsWcagAA(blackRatio);
    const whiteCompliant = meetsWcagAA(whiteRatio);

    if (blackCompliant && whiteCompliant) return blackRatio >= whiteRatio ? towardBlack : towardWhite;
    if (blackCompliant) return towardBlack;
    if (whiteCompliant) return towardWhite;
  }

  return contrastRatio("#000000", background) >= contrastRatio("#ffffff", background) ? "#000000" : "#ffffff";
}

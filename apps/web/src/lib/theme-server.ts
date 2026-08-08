import "server-only";
import type { CurrentThemeResponseDto } from "@klickit/contracts";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1";

/**
 * Server-only fetch of the public `GET /branding/theme/current` (no auth —
 * `@Public()` on `ThemesController.currentTheme`). This is the ONE
 * intentional server-side data fetch in this app (shell/branding chrome,
 * not business data — see docs/phase-6/PROGRESS.md's scope note; every
 * other screen fetches client-side via TanStack Query per ADR-004).
 *
 * Called directly by `app/layout.tsx` (SSR CSS-variable injection, avoiding
 * a flash of default theme) AND wrapped by `app/api/theme/route.ts` (a thin
 * same-origin JSON endpoint client components can re-fetch from, e.g. after
 * a branding change, without needing `NEXT_PUBLIC_API_BASE_URL` themselves).
 * Sharing this one function instead of the layout calling its own route
 * handler over HTTP avoids a pointless self-referential network hop during
 * SSR.
 *
 * Falls back to the same hardcoded Infoney default bundle the backend
 * itself falls back to (`INFONEY_DEFAULT_THEME_TOKENS` et al) if the API is
 * completely unreachable at SSR time (e.g. apps/api not yet booted) — the
 * page must still render, never a hard SSR crash over branding chrome.
 */
export async function getCurrentThemeServer(): Promise<CurrentThemeResponseDto> {
  try {
    const res = await fetch(`${API_BASE_URL}/branding/theme/current`, {
      // Branding rarely changes; a short revalidate window keeps SSR fast
      // while still picking up a newly-published theme within a minute.
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      throw new Error(`GET /branding/theme/current -> ${res.status}`);
    }
    return (await res.json()) as CurrentThemeResponseDto;
  } catch {
    return FALLBACK_THEME;
  }
}

/**
 * Mirrors `packages/server/src/platform/branding/application/infoney-default-theme.ts`
 * exactly (field-for-field) — the same fallback the backend itself falls
 * back to when nothing is PUBLISHED yet, so apps/web never disagrees with
 * apps/api about what "no theme configured" looks like.
 *
 * 2026-07-28 correction (docs/phase-6/PROGRESS.md Slice 1.5c): this is a
 * THIRD mirror of the same brand palette (alongside `packages/server`'s own
 * constant and `styles/tokens.css`'s fallback) that the brand-color audit
 * found still carrying the old `#CFA22D` (Gold) value after the other two
 * were corrected to the real accent/CTA Orange `#FBB03B` — this file's own
 * doc comment above already promises "mirrors ... exactly, field-for-field",
 * so leaving it stale would silently break that promise. Fixed here too.
 */
const FALLBACK_THEME: CurrentThemeResponseDto = {
  themeId: null,
  name: "Infoney Default",
  status: "PUBLISHED",
  isFallback: true,
  cssVariables: {
    "--color-primary": "#573399",
    "--color-secondary": "#FBF80D",
    "--color-accent": "#FBB03B",
    "--color-primary-light": "#9371F8",
    "--color-primary-soft": "#A972FA",
    "--color-primary-lavender": "#CCACF4",
    "--color-surface": "#FDFDFE",
    "--color-dark": "#341E40",
    "--color-black": "#000000",
    "--font-family": "Poppins, sans-serif",
    "--radius-sm": "4px",
    "--radius-md": "8px",
    "--radius-lg": "16px",
    "--radius-xl": "24px",
    "--spacing-xs": "4px",
    "--spacing-sm": "8px",
    "--spacing-md": "12px",
    "--spacing-lg": "16px",
    "--spacing-xl": "24px",
    "--spacing-xxl": "32px",
    "--spacing-xxxl": "48px",
  },
  tokens: {
    colors: {
      primary: "#573399",
      secondary: "#FBF80D",
      accent: "#FBB03B",
      primaryLight: "#9371F8",
      primarySoft: "#A972FA",
      primaryLavender: "#CCACF4",
      surface: "#FDFDFE",
      dark: "#341E40",
      black: "#000000",
    },
    fontFamily: "Poppins, sans-serif",
    radius: { sm: "4px", md: "8px", lg: "16px", xl: "24px" },
    spacing: { xs: "4px", sm: "8px", md: "12px", lg: "16px", xl: "24px", xxl: "32px", xxxl: "48px" },
  },
  loginConfig: { welcomeText: "Welcome to Klickit Finance ERP" },
  documentConfig: { headerText: "Infoney Solutions", signatureFileIds: [] },
  logoFileId: null,
  faviconFileId: null,
  // Slice 14 Part 3: the backend's ResolvedThemeBundle/CurrentThemeResponseDto
  // gained 3 signed-URL fields (logoUrl/faviconUrl/loginBackgroundImageUrl,
  // resolved in-process via FilesService). This SSR-unreachable fallback has
  // no file_object references at all (logoFileId/faviconFileId are already
  // null above), so all 3 are trivially null too — no signed-URL resolution
  // to attempt when the API can't even be reached.
  logoUrl: null,
  faviconUrl: null,
  loginBackgroundImageUrl: null,
  publishedAt: null,
};

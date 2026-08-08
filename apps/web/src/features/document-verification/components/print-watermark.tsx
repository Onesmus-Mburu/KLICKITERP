"use client";

import { useTranslations } from "next-intl";
import { useCurrentTheme } from "../hooks/use-current-theme";

/**
 * A diagonal, low-opacity, tiled text overlay for the two real print views
 * (`(erp)/payments/receipts/[id]/page.tsx`, `(erp)/billing/fee-structures/[id]/page.tsx`)
 * — the first real consumer of `documentConfig.watermarkText`
 * (`CurrentThemeResponseDto`), a field that has had ZERO consumers anywhere
 * in this codebase before this component.
 *
 * Falls back to the theme's own `name` when no `watermarkText` is
 * configured, and to a translated generic fallback if even `name` somehow
 * isn't available yet (still loading) — a printed financial document with
 * no watermark text at all defeats this whole feature's purpose, so this
 * never renders nothing.
 *
 * Renders as a normal (not `hidden`) block so it's visible on-screen too —
 * `print:block` is added explicitly alongside so it's guaranteed to survive
 * into the actual print output as well, matching the same "what you see is
 * what prints" principle the two print views already establish for their
 * own content (`Print` button copy, `print:border-0`/`print:shadow-none`
 * card resets).
 *
 * Uses a real Tailwind `opacity-*` utility on the text elements themselves,
 * NOT a `text-foreground/10`-style color-opacity modifier — this app's own
 * raw-hex CSS-variable colors silently ignore that modifier (documented in
 * `components/layout/sidebar.tsx`'s decorative-diamond-motif doc comment,
 * the established precedent this component mirrors for the exact same
 * limitation).
 *
 * Expects an `absolute`/`relative`-positioned ancestor from the caller
 * (`inset-0` here) — both print views wrap their printable card stack in a
 * `<div className="relative">` for this reason. `pointer-events-none` +
 * `aria-hidden` (purely decorative, like the sidebar motifs) so it never
 * intercepts clicks on any interactive content it happens to sit above.
 */
const TILE_COUNT = 48;

export function PrintWatermark() {
  const t = useTranslations("documentVerification.watermark");
  const themeQuery = useCurrentTheme();
  const theme = themeQuery.data;
  const text = theme?.documentConfig.watermarkText?.trim() || theme?.name?.trim() || t("fallbackText");

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 block overflow-hidden print:block">
      <div className="absolute left-1/2 top-1/2 flex w-[220%] max-w-none -translate-x-1/2 -translate-y-1/2 -rotate-[30deg] flex-wrap justify-center gap-x-12 gap-y-10">
        {Array.from({ length: TILE_COUNT }, (_, i) => (
          <span key={i} className="select-none whitespace-nowrap text-2xl font-semibold uppercase tracking-widest text-foreground opacity-10">
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}

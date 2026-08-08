import { getTranslations } from "next-intl/server";
import { getCurrentThemeServer } from "@/lib/theme-server";
import { NavLinks } from "./nav-links";

/**
 * Static chrome — a server component (per docs/phase-6/PROGRESS.md scope
 * item 7: "server component for static chrome, client islands for
 * session-aware bits"). Ships ONLY the `dashboard` nav entry this slice —
 * deliberately no stub links/route folders for the other ~15 staff
 * modules, per this slice's own explicit scope boundary.
 *
 * Slice 14 Part 3: reads `theme.logoUrl` (a signed URL resolved server-side
 * by `ThemesService`, bundled into the same public `getCurrentThemeServer()`
 * call `(auth)/layout.tsx` already makes — no new fetch logic) and renders a
 * real `<img>` logo in place of the static diamond glyph when a theme has
 * one configured. Any authenticated staff user sees it regardless of
 * whether they hold `files:file:view` — the signed URL was already resolved
 * in-process before this component ever ran, so no client-side permission
 * check is needed or possible here. Falls back to the original glyph,
 * completely unchanged, when no logo is set — augmenting real brand
 * identity, not unconditionally replacing it.
 */
export async function Sidebar() {
  const [t, theme] = await Promise.all([getTranslations("shell"), getCurrentThemeServer()]);

  return (
    // Slice 1.5c (creative sidebar shape, docs/phase-6/PROGRESS.md): was a
    // plain flush-edge `<aside>` spanning full viewport height with no
    // radius/margin (Slice 1.5's own `bg-card`->`bg-brand-dark` judgment
    // call #1 is UNCHANGED here — the sidebar still stays `--color-dark`
    // toned regardless of the app's own light/dark toggle). Redesigned into
    // a floating, elevated panel per the user's reference ("Jobie"
    // dashboard, hand-annotated): inset from the viewport edges (`m-4`,
    // applied here directly on the flex item rather than a wrapper div —
    // margin on a flex item with the row's default `align-items: stretch`
    // still lets it fill the row's full height minus the vertical margins,
    // so no extra height math is needed), `rounded-xl` (the existing
    // `--radius-xl` token, same tier `Card` already uses), `shadow-card`
    // for elevation (the same shadow every other panel in this design
    // system uses). The old `border-r border-border` is dropped — a
    // border made sense for a flush structural block sharing an edge with
    // the canvas; a floating card fully surrounded by canvas reads its
    // edge from the shadow + rounded corners instead, a border would just
    // double up. See `(erp)/layout.tsx` for the matching outer-layout
    // change (h-screen + independently-scrolling `<main>`, so this panel
    // stays visually "floating" for the page's full height rather than
    // just being a tall rounded rectangle that scrolls away with content).
    <aside className="relative m-4 hidden w-60 shrink-0 flex-col overflow-hidden rounded-xl bg-brand-dark shadow-card md:flex print:hidden">
      {/* Geometric motif, sourced from the brand PDF's own "Layout & UI
          Principles" (p.10): "Geometric Motifs: Diamonds from logo" (the
          Infoney logo mark is itself diamond-shaped). A single large,
          very-low-opacity diamond (a rotated square) anchored in the
          header's corner — real element `opacity` (not a Tailwind color
          `/NN` modifier, which this app's raw-hex CSS-variable colors
          silently ignore, per the documented Slice 1.5b bug #3) so it's
          genuinely subtle regardless of that limitation. Purely decorative,
          `aria-hidden`, and `pointer-events-none` so it never intercepts
          clicks or gets read by a screen reader. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rotate-45 rounded-2xl border border-brand-surface opacity-[0.06]"
      />
      {/* A second, smaller echo lower in the panel — two related shapes
          read as a deliberate motif rather than a stray artifact, while
          staying well within "subtle, restrained" for finance software. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rotate-45 rounded-2xl border border-brand-surface opacity-[0.04]"
      />

      <div className="relative z-10 flex h-16 shrink-0 items-center gap-2.5 border-b border-brand-surface/10 px-4">
        {/* The diamond-logo motif again, small and solid this time — a
            literal stand-in "logo mark" glyph in the corrected brand accent
            Orange (see infoney-default-theme.ts's 2026-07-28 fix), tying
            this round's two changes together rather than leaving them
            unrelated. */}
        {theme.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed, expiring MinIO URL isn't a static asset next/image can profitably optimize/cache.
          <img src={theme.logoUrl} alt="" className="h-6 w-6 shrink-0 rounded-[2px] object-contain" />
        ) : (
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px] bg-brand-accent" />
        )}
        <span className="text-base font-semibold text-brand-surface" style={{ fontFamily: "var(--font-family)" }}>
          {t("productName")}
        </span>
      </div>
      <div className="relative z-10 flex-1 overflow-y-auto py-4">
        <NavLinks />
      </div>
    </aside>
  );
}

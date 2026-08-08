import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { getCurrentThemeServer } from "@/lib/theme-server";
import { buildSemanticDarkVariables, buildSemanticLightVariables, toCssBlock } from "@/lib/theme";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Klickit Finance ERP",
  description: "Klickit Finance ERP — staff console",
};

/**
 * Real font check (docs/phase-6/PROGRESS.md Slice 1.5c): `ThemeTokens.fontFamily`
 * has always said `"Poppins, sans-serif"` (backend + every `--font-family`
 * mirror), and `globals.css`'s `body { font-family: var(--font-family); }`
 * has always applied it — but until this fix NOTHING in this app actually
 * loaded a font file/`@font-face` for a family literally named "Poppins".
 * A browser resolving `font-family: "Poppins", sans-serif` with no such
 * `@font-face` registered simply can't match the name and silently falls
 * through to plain system sans-serif — confirmed empirically: the compiled
 * CSS bundle had zero `@font-face` rules before this fix (grep-checked).
 * `next/font/google` self-hosts the real Poppins files at build time (no
 * runtime Google Fonts request) and, merely by being imported and its
 * `.variable` referenced once in the tree, makes Next emit a real
 * `@font-face` for the family name "Poppins" into the page — which is all
 * that's needed for the EXISTING `var(--font-family)` token chain to now
 * actually resolve to it, with zero change to the per-tenant theming
 * mechanism itself (a tenant whose theme sets a different `fontFamily`
 * string still falls through to system sans-serif exactly as before — only
 * the app's own DEFAULT brand font, the one this check was about, is fixed
 * here). `variable` (not `className`) is used deliberately: it only adds a
 * CSS custom property, it does not assert `font-family` on the element
 * itself, so it can never fight the theme-driven `--font-family` var.
 */
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins-loader",
  display: "swap",
});

/**
 * SSR theme injection (docs/phase-6/PROGRESS.md scope item 3): fetches the
 * real, live `GET /branding/theme/current` bundle server-side (via
 * `getCurrentThemeServer()`, `lib/theme-server.ts`) and writes BOTH the
 * light (`:root`) and programmatically-derived dark (`:root[data-theme=dark]`)
 * CSS-variable blocks straight into the document `<head>` before any client
 * JS runs — this is what avoids a flash of the wrong/default theme
 * (`styles/tokens.css`'s own hardcoded values are only a same-second
 * fallback for the rare case this fetch fails, see `theme-server.ts`).
 * `next-themes` (`app/providers.tsx`) then just toggles the `data-theme`
 * attribute the second CSS block is keyed on.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [theme, locale, messages] = await Promise.all([getCurrentThemeServer(), getLocale(), getMessages()]);
  const lightVars = buildSemanticLightVariables(theme);
  const darkVars = buildSemanticDarkVariables(theme);
  const themeCss = `${toCssBlock(":root", lightVars)}${toCssBlock(':root[data-theme="dark"]', darkVars)}`;

  return (
    <html lang={locale} suppressHydrationWarning className={poppins.variable}>
      <head>
        {/* Trusted, server-generated CSS from our own theme builder, never user input. */}
        <style id="klickit-theme-vars" dangerouslySetInnerHTML={{ __html: themeCss }} />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

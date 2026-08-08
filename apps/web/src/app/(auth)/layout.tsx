import { getTranslations } from "next-intl/server";
import { getCurrentThemeServer } from "@/lib/theme-server";

/**
 * Server component shell for the public `/login` (and future sub-routes)
 * segment — reads `loginConfig.welcomeText` from the same SSR theme fetch
 * `app/layout.tsx` already performed (a second cheap call, cached by
 * Next.js's fetch dedupe within the same request since it's the identical
 * URL). No auth guard here on purpose: this segment IS the public one.
 *
 * Slice 1.5 (visual redesign, docs/phase-6/PROGRESS.md): two-column split on
 * `lg+` — a dark brand panel (reusing the exact `bg-brand-dark`/
 * `text-brand-surface` pairing sidebar.tsx already established for
 * on-dark-chrome content) alongside the centered, elevated auth card
 * (`login`/`change-password` inherit the restyled `Card` — `rounded-xl` +
 * `shadow-card` — with zero logic changes to either page). Collapses to a
 * single column below `lg` (brand panel hidden, the same centered-heading
 * treatment the single-column layout always had is kept for mobile).
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const [theme, t] = await Promise.all([getCurrentThemeServer(), getTranslations("shell")]);
  const welcomeText = theme.loginConfig.welcomeText ?? "Klickit Finance ERP";
  // Slice 14 Part 3: `theme.loginBackgroundImageUrl` is a signed URL the
  // backend already resolved server-side (ThemesService, in-process
  // FilesService call) — this pre-auth page carries no bearer token at all,
  // so it could never have resolved `loginConfig.backgroundImageFileId`
  // itself. When unset, the panel stays exactly `bg-brand-dark` as today.
  const brandPanelStyle: React.CSSProperties = {
    fontFamily: "var(--font-family)",
    ...(theme.loginBackgroundImageUrl
      ? {
          backgroundImage: `url(${theme.loginBackgroundImageUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : {}),
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="hidden flex-col justify-center gap-4 bg-brand-dark px-12 py-16 text-brand-surface lg:flex lg:w-1/2" style={brandPanelStyle}>
        <span className="text-2xl font-semibold">{t("productName")}</span>
        <p className="max-w-sm text-sm text-brand-surface/70">{welcomeText}</p>
      </div>
      <div className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-12 lg:w-1/2">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center lg:hidden">
            <h1 className="text-xl font-semibold text-brand-dark" style={{ fontFamily: "var(--font-family)" }}>
              {welcomeText}
            </h1>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

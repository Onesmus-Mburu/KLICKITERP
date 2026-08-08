"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Moon, Sun } from "lucide-react";
import type { CurrentThemeResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildSemanticDarkVariables, buildSemanticLightVariables } from "@/lib/theme";

/**
 * FR-BRND-002.1's "sample dashboard" Preview step, fed by `GET
 * /branding/themes/:id/preview` (any status, no side effects) via
 * `usePreviewTheme(id)`.
 *
 * **Scoped CSS-variable technique**: `app/layout.tsx` writes
 * `buildSemanticLightVariables`/`buildSemanticDarkVariables`'s output as TWO
 * GLOBAL CSS blocks (`:root` / `:root[data-theme="dark"]`) straight into the
 * document `<head>`. That's wrong for a preview embedded inside a real admin
 * page — it would repaint the whole admin UI's own chrome, not just this
 * pane. Instead, the exact same semantic variable NAMES (`--card`,
 * `--primary`, `--foreground`, etc.) are set as an INLINE `style` on ONE
 * wrapper `<div>` below. CSS custom properties inherit down the DOM tree and
 * the closest ancestor's value wins, so this wrapper's values apply only to
 * its own subtree and never escape it.
 *
 * This is what makes reusing the REAL `Card`/`Button`/`Badge` primitives
 * inside that wrapper work with zero extra plumbing: `tailwind.config.ts`
 * already aliases `bg-card`/`bg-primary`/`text-foreground`/`bg-secondary`/
 * etc. straight to `var(--card)`/`var(--primary)`/`var(--foreground)`/
 * `var(--secondary)` — the EXACT variable names these two builder functions
 * return — so no Tailwind arbitrary-value syntax (`bg-[var(--card)]`) was
 * even needed; confirmed by reading `tailwind.config.ts` and `card.tsx`/
 * `badge.tsx`/`button.tsx` directly before relying on it. The sample below
 * is therefore not a re-implementation of "what a themed card looks like"
 * — it's the app's OWN real design-system components, genuinely repainted
 * by this theme's real tokens.
 *
 * One deliberate exception: the `soft-*` Badge variants (`bg-tint-primary`
 * etc.) are NOT used here. Those tint tokens are `color-mix()`-derived once
 * at `:root` in `styles/tokens.css` using `:root`'s OWN `--primary`/`--card`
 * — a descendant inherits the already-resolved tint color, it does not
 * re-run `color-mix()` against this wrapper's locally-scoped override. Using
 * `variant="secondary"` (a plain `bg-secondary`/`text-secondary-foreground`
 * pairing, both genuinely scoped) avoids that trap and still exercises a
 * real theme color the primary button doesn't.
 */
export function ThemePreviewPane({ bundle }: { bundle: CurrentThemeResponseDto }) {
  const t = useTranslations("branding.preview");
  const [mode, setMode] = React.useState<"light" | "dark">("light");

  const vars = mode === "light" ? buildSemanticLightVariables(bundle) : buildSemanticDarkVariables(bundle);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <Button type="button" size="sm" variant={mode === "light" ? "secondary" : "outline"} onClick={() => setMode("light")}>
          <Sun className="size-4" />
          {t("lightMode")}
        </Button>
        <Button type="button" size="sm" variant={mode === "dark" ? "secondary" : "outline"} onClick={() => setMode("dark")}>
          <Moon className="size-4" />
          {t("darkMode")}
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-background p-6" style={vars as React.CSSProperties}>
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-foreground">{t("sampleTitle")}</CardTitle>
            <CardDescription>{t("sampleDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("sampleBody")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button">{t("samplePrimaryAction")}</Button>
              <Button type="button" variant="outline">
                {t("sampleSecondaryAction")}
              </Button>
              <Badge variant="secondary">{t("sampleStatus")}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Honest, explicit note — FR-BRND-002.1 also spec's a "sample invoice
          PDF" preview half; no PDF rendering exists anywhere in this
          codebase (`ExportJobsService`'s own doc comment repeatedly,
          deliberately defers it), so that half is silently impossible to
          build here, not silently omitted without explanation. */}
      <Alert variant="warning">
        <AlertDescription>{t("pdfNotAvailable")}</AlertDescription>
      </Alert>
    </div>
  );
}

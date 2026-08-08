"use client";

import { Check, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { contrastRatio, meetsWcagAA, suggestNearestCompliantColor } from "../lib/contrast";

/**
 * Inline WCAG AA badge for a single foreground/background pair, rendered
 * next to the `dark` and `primary` color fields ONLY (each measured against
 * the live `surface` value) — see `ColorsSection`'s own comment for why
 * those two are the real, load-bearing contrast pairs in this app's actual
 * rendering (`lib/theme.ts`'s `buildSemanticLightVariables`), not a generic
 * N-choose-2 matrix over all 9 colors.
 */
export function ContrastIndicator({
  foreground,
  background,
  onApplySuggestion,
}: {
  foreground: string;
  background: string;
  onApplySuggestion: (hex: string) => void;
}) {
  const t = useTranslations("branding.form.colors");
  const ratio = contrastRatio(foreground, background);
  const passes = meetsWcagAA(ratio);
  const suggestion = passes ? null : suggestNearestCompliantColor(foreground, background);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Badge variant={passes ? "soft-success" : "soft-destructive"} className="gap-1">
        {passes ? <Check className="size-3" aria-hidden /> : <AlertTriangle className="size-3" aria-hidden />}
        <span className="sr-only">{passes ? t("contrastPass") : t("contrastFail")}</span>
        {t("contrastRatio", { ratio: ratio.toFixed(1) })}
      </Badge>
      {suggestion && (
        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => onApplySuggestion(suggestion)}>
          {t("contrastUseSuggestion", { hex: suggestion })}
        </Button>
      )}
    </div>
  );
}

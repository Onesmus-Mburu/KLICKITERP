"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { CurrentThemeResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { ThemeEditorForm } from "@/features/branding/components/theme-editor-form";

/**
 * Seeds a new draft's defaults from whatever's CURRENTLY LIVE — a real
 * network response, not a 4th hardcoded mirror of the Infoney default
 * bundle (`lib/theme-server.ts`'s `FALLBACK_THEME`, `styles/tokens.css`'s
 * own fallback, and `packages/server`'s `infoney-default-theme.ts` are the
 * 3 that already exist — a known, deliberate smell not to add to). Hits the
 * SAME-ORIGIN `/api/theme` route handler (`app/api/theme/route.ts`, a thin
 * wrapper over the public `GET /branding/theme/current`), not a new
 * `themes.api.ts` wrapper — that file wraps the real backend surface
 * (`NEXT_PUBLIC_API_ORIGIN`), this is a different, same-origin Next.js
 * route, so it's a plain local `useQuery` + `fetch`, deliberately NOT added
 * to `use-themes.ts`.
 */
function useThemeSeed() {
  return useQuery({
    queryKey: ["branding", "theme-seed"] as const,
    queryFn: async (): Promise<CurrentThemeResponseDto> => {
      const res = await fetch("/api/theme");
      if (!res.ok) throw new Error(`GET /api/theme -> ${res.status}`);
      return (await res.json()) as CurrentThemeResponseDto;
    },
  });
}

export default function NewThemePage() {
  const t = useTranslations("branding.newPage");
  const seedQuery = useThemeSeed();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/branding">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={seedQuery}>{(seed) => <ThemeEditorForm mode="create" seed={seed} />}</QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}

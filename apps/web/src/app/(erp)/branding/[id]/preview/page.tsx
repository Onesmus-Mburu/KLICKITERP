"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { ThemePreviewPane } from "@/features/branding/components/theme-preview-pane";
import { usePreviewTheme } from "@/features/branding/hooks/use-themes";

/**
 * `GET /branding/themes/:id/preview` works for ANY theme status (`DRAFT`,
 * `PUBLISHED`, or `ARCHIVED`) with no side effects — this route mirrors
 * `[id]/edit/page.tsx`'s exact shell shape (back-link + `Card` +
 * `QueryBoundary`), just pointed at `usePreviewTheme` instead of `useTheme`.
 */
export default function ThemePreviewPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("branding.preview");
  const previewQuery = usePreviewTheme(id);

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
          <QueryBoundary query={previewQuery}>{(bundle) => <ThemePreviewPane bundle={bundle} />}</QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}

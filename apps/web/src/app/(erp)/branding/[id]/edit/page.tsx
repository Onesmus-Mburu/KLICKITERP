"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { ThemeEditorForm } from "@/features/branding/components/theme-editor-form";
import { useTheme } from "@/features/branding/hooks/use-themes";

/**
 * Phase 6 Slice 14 Part 2: the read-only-when-published guard now lives
 * inside `ThemeEditorForm` itself (`mode === "edit" && theme.status ===
 * "PUBLISHED"`), not here — this shell just fetches the theme and hands it
 * off, unchanged from Part 1.
 */
export default function EditThemePage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("branding.editPage");
  const themeQuery = useTheme(id);

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
          <QueryBoundary query={themeQuery}>{(theme) => <ThemeEditorForm mode="edit" theme={theme} />}</QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Star } from "lucide-react";
import type { ThemeResponseDto } from "@klickit/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-error";
import { usePublishTheme } from "../hooks/use-themes";

/**
 * Near-verbatim adaptation of `features/settings/components/
 * set-current-year-button.tsx` (per the approved plan) — a direct button +
 * mutation, NO confirm dialog: publishing a theme is genuinely reversible
 * (`RevertThemeButton`/`POST .../:id/revert` exists specifically to undo
 * it), the same reversibility test that precedent itself already uses to
 * decide confirm-vs-not. Errors render inline below the button — this cell
 * has no shared page-level error banner to report into.
 *
 * Decides badge-vs-button internally (unlike `RevertThemeButton`, which is
 * always a plain button — see that file's own doc comment for why): every
 * row in the themes list gets a `<PublishThemeButton>`, and a `PUBLISHED`
 * row still needs to show SOMETHING in this column, so the branch has to
 * live here rather than in the parent list page.
 */
export function PublishThemeButton({ theme }: { theme: ThemeResponseDto }) {
  const t = useTranslations("branding.publish");
  const mutation = usePublishTheme();
  const [error, setError] = React.useState<string | null>(null);

  if (theme.status === "PUBLISHED") {
    return (
      <Badge variant="soft-success">
        <Star className="mr-1 size-3" />
        {t("current")}
      </Badge>
    );
  }

  async function handleClick() {
    setError(null);
    try {
      await mutation.mutateAsync(theme.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-1">
      <Button type="button" size="sm" variant="outline" onClick={() => void handleClick()} disabled={mutation.isPending}>
        <Star className="size-4" />
        {mutation.isPending ? t("publishing") : t("publish")}
      </Button>
      {error && <p className="max-w-[16rem] text-xs text-destructive">{error}</p>}
    </div>
  );
}

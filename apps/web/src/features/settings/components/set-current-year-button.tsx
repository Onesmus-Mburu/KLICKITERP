"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-error";
import { useSetCurrentAcademicYear } from "../hooks/use-academic-calendar";
import type { AcademicYearResponse } from "../types";

/**
 * Phase 6 Slice 11 Part 1 — the first "set as current" affordance for
 * academic years anywhere in this app (the backend endpoint,
 * `POST /academic-years/:id/set-current`, has existed since Slice 3b with
 * no frontend caller until now). A direct button + mutation, not a
 * confirm-dialog wrapper: this is a reversible, non-destructive state flip
 * (the previous current year can always be set current again), matching
 * `nav-links.tsx`'s own "keep it simple" precedent for actions that don't
 * warrant a confirm step. A per-instance error message renders inline below
 * the button on failure — this cell has no shared page-level error banner
 * to report into.
 */
export function SetCurrentYearButton({ year }: { year: AcademicYearResponse }) {
  const t = useTranslations("settings.academicCalendar");
  const mutation = useSetCurrentAcademicYear();
  const [error, setError] = React.useState<string | null>(null);

  if (year.isCurrent) {
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
      await mutation.mutateAsync(year.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-1">
      <Button type="button" size="sm" variant="outline" onClick={() => void handleClick()} disabled={mutation.isPending}>
        <Star className="size-4" />
        {mutation.isPending ? t("settingCurrent") : t("setCurrent")}
      </Button>
      {error && <p className="max-w-[16rem] text-xs text-destructive">{error}</p>}
    </div>
  );
}

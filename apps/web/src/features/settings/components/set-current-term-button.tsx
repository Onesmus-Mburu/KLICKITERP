"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-error";
import { useSetCurrentTerm } from "../hooks/use-academic-calendar";
import type { TermResponse } from "../types";

/** Same shape as `<SetCurrentYearButton>` — see that component's own doc comment. Terms have a single GLOBAL "current" pointer (not scoped per academic year, per `set_term`'s own `uq_set_term_current_p` partial unique index), so setting one term current can un-current a term belonging to a completely different academic year than the one currently selected in the page's own year filter. */
export function SetCurrentTermButton({ term }: { term: TermResponse }) {
  const t = useTranslations("settings.academicCalendar");
  const mutation = useSetCurrentTerm();
  const [error, setError] = React.useState<string | null>(null);

  if (term.isCurrent) {
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
      await mutation.mutateAsync(term.id);
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

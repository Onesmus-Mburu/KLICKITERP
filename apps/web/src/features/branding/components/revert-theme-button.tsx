"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import type { ThemeResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-error";
import { useRevertTheme } from "../hooks/use-themes";

/**
 * Same direct-button-+-mutation, no-confirm-dialog shape as
 * `PublishThemeButton`/`set-current-year-button.tsx` — reverting is itself
 * just another publish (`ThemesService.revert()` re-publishes the target
 * atomically, same unset-then-set swap), so the same reversibility
 * reasoning applies.
 *
 * Deliberately ALWAYS renders the button (no internal `status === "ARCHIVED"`
 * branch) — per the plan, the parent list page decides WHETHER to render
 * this component at all (only for `ARCHIVED` rows), keeping this component
 * itself simpler and more directly testable in isolation.
 */
export function RevertThemeButton({ theme }: { theme: ThemeResponseDto }) {
  const t = useTranslations("branding.revert");
  const mutation = useRevertTheme();
  const [error, setError] = React.useState<string | null>(null);

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
        <RotateCcw className="size-4" />
        {mutation.isPending ? t("reverting") : t("revert")}
      </Button>
      {error && <p className="max-w-[16rem] text-xs text-destructive">{error}</p>}
    </div>
  );
}

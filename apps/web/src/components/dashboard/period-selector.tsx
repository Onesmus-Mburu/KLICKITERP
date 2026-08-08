"use client";

import { useTranslations } from "next-intl";
import type { PeriodResponseDto } from "@klickit/contracts";

/**
 * Lightweight period picker (flagged decision #3, docs/phase-6/PROGRESS.md)
 * for the dashboard's period-scoped KPIs. A plain native `<select>` rather
 * than a Radix Select — this slice's own scope trim, given a full
 * date-range/period-picker component wasn't warranted for a single
 * dropdown of already-fetched periods.
 */
export function PeriodSelector({
  periods,
  value,
  onChange,
}: {
  periods: PeriodResponseDto[];
  value: string | undefined;
  onChange: (periodId: string) => void;
}) {
  const t = useTranslations("dashboard.period");

  if (periods.length === 0) {
    return <span className="text-xs text-muted-foreground">{t("none")}</span>;
  }

  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      {t("label")}
      <select
        className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        {periods
          .slice()
          .sort((a, b) => b.seq - a.seq)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.startsOn} → {p.endsOn}
            </option>
          ))}
      </select>
    </label>
  );
}

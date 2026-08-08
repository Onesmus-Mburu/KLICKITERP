"use client";

import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";

/**
 * Slice 1.5 (visual redesign) — replaces the plain KPI card previously used
 * for `collectionRate` (docs/phase-6/PROGRESS.md). A same-hue Recharts
 * `RadialBarChart` meter: track = `--tint-primary`, fill = `--color-primary`
 * — a single-hue progress meter, NOT a fabricated two-color "remaining %"
 * donut (there's no backend-defined "good/bad" threshold to color against —
 * judgment call #2, inventing one would be fabricated semantics). Existing
 * dataviz `--viz-*` series colors are deliberately untouched; this uses the
 * raw brand `--color-primary`/derived `--tint-primary` tokens instead since
 * it's a brand-hued meter, not a categorical chart series.
 *
 * Null handling mirrors `dashboard/page.tsx`'s original inline
 * `data.collectionRate === null ? "—" : ...` exactly — same check, same "—"
 * fallback, just relocated into this component.
 */
export function CollectionRateGauge({ rate, subtitle }: { rate: number | null; subtitle?: string }) {
  const pct = rate === null ? 0 : Math.max(0, Math.min(1, rate)) * 100;
  const data = [{ value: pct }];

  return (
    <div className="flex h-64 w-full flex-col items-center justify-center">
      <div className="relative size-40">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart data={data} innerRadius="72%" outerRadius="100%" startAngle={90} endAngle={-270} barSize={14}>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={999} fill="var(--color-primary)" background={{ fill: "var(--tint-primary)" }} isAnimationActive={false} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-semibold tracking-tight">{rate === null ? "—" : `${(rate * 100).toFixed(1)}%`}</span>
        </div>
      </div>
      {subtitle && <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

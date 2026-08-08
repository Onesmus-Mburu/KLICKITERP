"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/money";
import type { CollectionTrendPoint } from "@/types/dashboard";

/**
 * Single-series magnitude-over-time -> a line/area form (dataviz skill
 * "choosing a form" step). One series needs no legend (the card title
 * already names it) — see the skill's own accessibility-pass rule. Uses
 * categorical slot 1 (blue, `--viz-series-1`) as the series' identity
 * color; amounts formatted via `lib/money.ts` (never `parseFloat`), axis
 * ticks/gridlines use the recessive chart-chrome tokens, not brand colors.
 */
export function CollectionTrendChart({ points }: { points: CollectionTrendPoint[] }) {
  const data = points.map((p) => ({ bucket: p.bucket, amount: Number(p.amount) }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="collectionTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--viz-series-1)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--viz-series-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--viz-grid)" vertical={false} />
          <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "var(--viz-muted)" }} axisLine={{ stroke: "var(--viz-baseline)" }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "var(--viz-muted)" }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => formatMoney(String(v), { fractionDigits: 0 })} />
          <Tooltip
            formatter={(value: number) => [formatMoney(String(value)), undefined]}
            contentStyle={{ background: "var(--viz-surface)", border: "1px solid var(--viz-grid)", borderRadius: 12, boxShadow: "var(--shadow-card)", fontSize: 12 }}
            labelStyle={{ color: "var(--viz-text-primary)" }}
          />
          <Area type="monotone" dataKey="amount" stroke="var(--viz-series-1)" strokeWidth={2} fill="url(#collectionTrendFill)" activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

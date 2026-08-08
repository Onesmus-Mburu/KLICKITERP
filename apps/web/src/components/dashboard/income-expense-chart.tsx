"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslations } from "next-intl";
import { formatMoney } from "@/lib/money";
import type { IncomeVsExpensePoint } from "@/types/dashboard";

/**
 * Two-series comparison across periods -> grouped bars, categorical color
 * (identity), fixed order (income = slot 1 blue, expense = slot 2 orange —
 * never cycled/reassigned). A legend is always present for >=2 series per
 * the dataviz skill's accessibility-pass rule; bars get a small radius on
 * their data-end per the mark spec.
 */
export function IncomeExpenseChart({ points }: { points: IncomeVsExpensePoint[] }) {
  const t = useTranslations("dashboard.kpis");
  const data = points.map((p) => ({
    period: p.periodStartsOn,
    income: Number(p.income),
    expense: Number(p.expense),
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--viz-grid)" vertical={false} />
          <XAxis dataKey="period" tick={{ fontSize: 11, fill: "var(--viz-muted)" }} axisLine={{ stroke: "var(--viz-baseline)" }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "var(--viz-muted)" }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => formatMoney(String(v), { fractionDigits: 0 })} />
          <Tooltip
            formatter={(value: number) => [formatMoney(String(value)), undefined]}
            contentStyle={{ background: "var(--viz-surface)", border: "1px solid var(--viz-grid)", borderRadius: 12, boxShadow: "var(--shadow-card)", fontSize: 12 }}
            labelStyle={{ color: "var(--viz-text-primary)" }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--viz-text-secondary)" }} />
          <Bar dataKey="income" name={t("revenue")} fill="var(--viz-series-1)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" name={t("expense")} fill="var(--viz-series-2)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

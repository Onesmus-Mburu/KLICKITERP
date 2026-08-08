"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fadeInUp, staggerDelay } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Real prior-period delta only — never fabricated. Audited all 10 real
 * `dashboard.controller.ts` endpoints during Slice 1.5 (docs/phase-6/PROGRESS.md):
 * none currently return a genuine prior-period comparison value, so no call
 * site in `dashboard/page.tsx` passes this prop today. It exists so a
 * future real endpoint can plug in without another KpiCard rework.
 */
export interface KpiTrend {
  value: number;
  label?: string;
}

type KpiTone = "default" | "success" | "warning" | "destructive";

const TONE_ICON_TEXT: Record<KpiTone, string> = {
  default: "text-primary",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

const TONE_ICON_BG: Record<KpiTone, string> = {
  default: "bg-tint-primary",
  success: "bg-tint-success",
  warning: "bg-tint-warning",
  destructive: "bg-tint-destructive",
};

export function KpiCard({
  title,
  value,
  subtitle,
  tone = "default",
  icon: Icon,
  trend,
  index = 0,
}: {
  title: string;
  value: string;
  subtitle?: string;
  tone?: KpiTone;
  /** Slice 1.5 (visual redesign) — a colored icon badge replacing the bare-number KPI card, per the reference screenshots. Optional so any call site not yet given a semantically-sensible icon still renders correctly. */
  icon?: React.ComponentType<{ className?: string }>;
  trend?: KpiTrend;
  /**
   * Slice 1.5b (visual polish iteration) — 0-based position in its grid,
   * used only to compute a small stagger delay (`lib/motion.ts`'s
   * `staggerDelay`) for this card's own fade+rise mount animation. Each
   * `<KpiCard>` sits behind its own `<QueryBoundary>` and mounts
   * independently once ITS query resolves (docs/phase-6/PROGRESS.md scope
   * item 8 — one failing widget never blanks the page), so this is a
   * best-effort visual stagger (real queries typically resolve within
   * milliseconds of each other, not a synchronized parent-controlled
   * stagger) rather than a guaranteed lock-step sequence.
   */
  index?: number;
}) {
  return (
    <motion.div variants={fadeInUp} custom={staggerDelay(index)} initial="hidden" animate="show">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <CardTitle>{title}</CardTitle>
          {Icon && (
            <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", TONE_ICON_BG[tone])}>
              <Icon className={cn("size-[18px]", TONE_ICON_TEXT[tone])} />
            </span>
          )}
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "text-2xl font-semibold tracking-tight",
              tone === "success" && "text-success",
              tone === "warning" && "text-warning",
              tone === "destructive" && "text-destructive",
            )}
          >
            {value}
          </div>
          <div className="mt-1 flex items-center gap-2">
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            {trend && (
              <span className={cn("text-xs font-medium", trend.value >= 0 ? "text-success" : "text-destructive")}>
                {trend.value >= 0 ? "+" : ""}
                {trend.value}
                {trend.label ? ` ${trend.label}` : ""}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

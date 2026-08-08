"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Landmark, PiggyBank, RefreshCw, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { Reveal } from "@/components/patterns/reveal";
import { DashboardGreeting } from "@/components/dashboard/greeting";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { CollectionRateGauge } from "@/components/dashboard/collection-rate-gauge";
import { CollectionTrendChart } from "@/components/dashboard/collection-trend-chart";
import { IncomeExpenseChart } from "@/components/dashboard/income-expense-chart";
import { DefaultersTable } from "@/components/dashboard/defaulters-table";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { formatMoney } from "@/lib/money";
import { staggerDelay } from "@/lib/motion";
import { useCurrentPeriodContext } from "@/hooks/use-periods";
import {
  useCashFlow,
  useCollectionRate,
  useCollectionTrend,
  useDefaultersCount,
  useIncomeVsExpense,
  useOutstandingFees,
  useRefreshDashboard,
  useRevenueExpenseSurplus,
  useTodaysCollection,
  useTopDefaulters,
  useWalletLiability,
} from "@/hooks/use-dashboard";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
const TODAY_ISO = new Date().toISOString().slice(0, 10);

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tKpi = useTranslations("dashboard.kpis");

  const { periods, currentPeriod } = useCurrentPeriodContext();
  const [selectedPeriodId, setSelectedPeriodId] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (!selectedPeriodId && currentPeriod) {
      setSelectedPeriodId(currentPeriod.id);
    }
  }, [currentPeriod, selectedPeriodId]);

  // Income-vs-Expense range: up to the last 6 periods ending at the
  // selected one (flagged decision #3 — see period-selector.tsx / use-periods.ts).
  const sortedPeriods = [...periods].sort((a, b) => a.seq - b.seq);
  const selectedIndex = sortedPeriods.findIndex((p) => p.id === selectedPeriodId);
  const rangeStart = selectedIndex >= 0 ? Math.max(0, selectedIndex - 5) : 0;
  const fromPeriodId = selectedIndex >= 0 ? sortedPeriods[rangeStart]?.id : undefined;
  const toPeriodId = selectedPeriodId;

  // Phase 6 Slice 10 — auto-refresh on mount, then gate the MV-backed KPI
  // queries behind that refresh's completion. `mv_daily_collections`/
  // `mv_ar_summary`/`mv_income_expense`/`mv_wallet_liability`/
  // `mv_defaulters` have NO automatic refresh cadence (`MvRefreshService`'s
  // own doc comment) — only this mutation (`POST /dashboard/refresh-mvs`)
  // updates them, previously only reachable via the manual "Refresh data"
  // button below (which stays, unchanged, for an on-demand mid-session
  // nudge). Fired once per mount via a `useRef` guard — the same "run
  // exactly once" pattern `collect-fees-flow.tsx`'s own
  // `appliedInitialStudentRef`/`appliedInitialInvoiceRef` already establish
  // — so React StrictMode's dev-only double-invoke of mount effects still
  // only ever fires ONE real refresh call.
  const refreshMutation = useRefreshDashboard();
  // Settled (either way) = safe to let the gated queries fire. Deliberately
  // NOT `isSuccess` alone — a genuine refresh FAILURE must still let the
  // KPI queries fire (against whatever data the MVs already hold) so the
  // page degrades gracefully instead of staying blank forever behind a
  // dead gate.
  const mvKpisReady = refreshMutation.isSuccess || refreshMutation.isError;

  const hasFiredMountRefreshRef = React.useRef(false);
  React.useEffect(() => {
    if (hasFiredMountRefreshRef.current) return;
    hasFiredMountRefreshRef.current = true;
    refreshMutation.mutate();
    // Mount-only, intentionally — the ref guard above (not this dependency
    // array) is what prevents a double-fire; `refreshMutation.mutate` is a
    // stable TanStack Query v5 reference either way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todaysCollection = useTodaysCollection(); // live query (Slice 10) — never MV-backed, no gating needed
  const outstandingFees = useOutstandingFees({ enabled: mvKpisReady }); // mv_ar_summary
  const collectionRate = useCollectionRate(selectedPeriodId); // live ledger query (see getCollectionRate()'s own doc comment) — not MV-backed, no gating needed
  const revenueExpenseSurplus = useRevenueExpenseSurplus(selectedPeriodId, { enabled: mvKpisReady }); // mv_income_expense
  const walletLiability = useWalletLiability({ enabled: mvKpisReady }); // mv_wallet_liability
  const defaultersCount = useDefaultersCount({ enabled: mvKpisReady }); // mv_defaulters
  const topDefaulters = useTopDefaulters(10, { enabled: mvKpisReady }); // mv_defaulters
  // mv_daily_collections-backed too, but deliberately NOT gated: a 30-day
  // historical trend/cash-flow/income-vs-expense series doesn't need
  // second-by-second correctness the way a single "right now" tile does
  // (the plan's own explicit scope boundary for this fix).
  const collectionTrend = useCollectionTrend("day", isoDaysAgo(30), TODAY_ISO);
  const cashFlow = useCashFlow(isoDaysAgo(90), TODAY_ISO);
  const incomeVsExpense = useIncomeVsExpense(fromPeriodId, toPeriodId);

  return (
    // Slice 1.5b (visual polish iteration): `space-y-6` -> `space-y-8` and
    // the KPI/chart grid gaps `gap-4` -> `gap-5` — a more deliberate section
    // rhythm (this round's own "generous, deliberate whitespace" note),
    // while keeping the tight `gap-2`/`gap-4` spacing inside each
    // card/header untouched (that's content-density spacing, a different
    // concern from section-to-section rhythm).
    <div className="space-y-8">
      {/* Slice 1.5c (docs/phase-6/PROGRESS.md): real-name, real-time-of-day
          greeting, above the page's own title/KPI grid per the user's ask.
          Its own file documents why it's a self-updating client component
          rather than a value computed once and frozen at page load. */}
      <DashboardGreeting />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-4">
          <PeriodSelector periods={periods} value={selectedPeriodId} onChange={setSelectedPeriodId} />
          <Button onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending} variant="outline">
            <RefreshCw className={refreshMutation.isPending ? "animate-spin" : ""} />
            {refreshMutation.isPending ? t("refreshing") : t("refreshButton")}
          </Button>
        </div>
      </div>

      <p className="-mt-4 text-xs text-muted-foreground">{t("currencyNote")}</p>

      {/* Each widget below gets its OWN <QueryBoundary> instance — a failing
          endpoint (e.g. a 403 for a role missing dashboard:view) never
          blanks the rest of the page. Slice 1.5 (visual redesign):
          `collectionRate` moved OUT of this KPI grid into its own gauge
          card below (judgment call #3) — a squarish radial meter doesn't
          fit a rectangular KPI row; the remaining 7 KPI cards each got a
          semantically-matched lucide icon per the redesign plan. Slice 1.5b
          (visual polish iteration): each <KpiCard> gets a 0-based `index`
          for its own staggered fade+rise mount animation (see
          kpi-card.tsx's doc comment on why this is a best-effort stagger,
          not a lock-step one, given each card's independent query). */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <QueryBoundary query={todaysCollection}>
          {(data) => <KpiCard title={tKpi("todaysCollection")} value={formatMoney(data.total)} subtitle={data.date} icon={Wallet} index={0} />}
        </QueryBoundary>

        <QueryBoundary query={outstandingFees}>
          {(data) => <KpiCard title={tKpi("outstandingFees")} value={formatMoney(data.total)} tone="warning" icon={AlertTriangle} index={1} />}
        </QueryBoundary>

        <QueryBoundary query={defaultersCount}>
          {(data) => <KpiCard title={tKpi("defaultersCount")} value={String(data.count)} tone="destructive" icon={Users} index={2} />}
        </QueryBoundary>

        <QueryBoundary query={revenueExpenseSurplus}>
          {(data) => <KpiCard title={tKpi("revenue")} value={formatMoney(data.revenue)} tone="success" icon={TrendingUp} index={3} />}
        </QueryBoundary>

        <QueryBoundary query={revenueExpenseSurplus}>{(data) => <KpiCard title={tKpi("expense")} value={formatMoney(data.expense)} icon={TrendingDown} index={4} />}</QueryBoundary>

        <QueryBoundary query={revenueExpenseSurplus}>
          {(data) => (
            <KpiCard
              title={tKpi("surplus")}
              value={formatMoney(data.surplus)}
              tone={data.surplus.startsWith("-") ? "destructive" : "success"}
              icon={PiggyBank}
              index={5}
            />
          )}
        </QueryBoundary>

        <QueryBoundary query={walletLiability}>
          {(data) => <KpiCard title={tKpi("walletLiability")} value={formatMoney(data.totalBalance)} subtitle={data.snapshotDate} icon={Landmark} index={6} />}
        </QueryBoundary>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Reveal delay={staggerDelay(7)}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-foreground">{tKpi("collectionRate")}</CardTitle>
            </CardHeader>
            <CardContent>
              <QueryBoundary query={collectionRate}>
                {(data) => <CollectionRateGauge rate={data.collectionRate} subtitle={formatMoney(data.periodReceipts)} />}
              </QueryBoundary>
            </CardContent>
          </Card>
        </Reveal>

        <Reveal delay={staggerDelay(8)}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-foreground">{t("charts.collectionTrend")}</CardTitle>
            </CardHeader>
            <CardContent>
              <QueryBoundary query={collectionTrend} isEmpty={(d) => d.length === 0}>
                {(data) => <CollectionTrendChart points={data} />}
              </QueryBoundary>
            </CardContent>
          </Card>
        </Reveal>

        <Reveal delay={staggerDelay(9)}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-foreground">{t("charts.incomeVsExpense")}</CardTitle>
            </CardHeader>
            <CardContent>
              <QueryBoundary query={incomeVsExpense} isEmpty={(d) => d.length === 0}>
                {(data) => <IncomeExpenseChart points={data} />}
              </QueryBoundary>
            </CardContent>
          </Card>
        </Reveal>
      </div>

      <Reveal delay={staggerDelay(10)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("defaulters.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <QueryBoundary query={topDefaulters} isEmpty={(d) => d.length === 0}>
              {(data) => <DefaultersTable rows={data} />}
            </QueryBoundary>
          </CardContent>
        </Card>
      </Reveal>

      <Reveal delay={staggerDelay(11)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("cashFlow.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <QueryBoundary query={cashFlow} isEmpty={(d) => d.rows.length === 0}>
              {(data) => (
                <p className="text-sm text-muted-foreground">
                  {data.rows.length} line item{data.rows.length === 1 ? "" : "s"}
                  {data.totals ? ` — ${Object.entries(data.totals).map(([k, v]) => `${k}: ${String(v)}`).join(", ")}` : ""}
                </p>
              )}
            </QueryBoundary>
          </CardContent>
        </Card>
      </Reveal>
    </div>
  );
}

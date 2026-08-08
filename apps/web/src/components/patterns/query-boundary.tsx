"use client";

import * as React from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { AlertTriangle, Lock, RefreshCw, WifiOff, Inbox } from "lucide-react";
import { useTranslations } from "next-intl";
import { ApiError, isNetworkError } from "@/lib/api-error";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export type QueryBoundaryState = "loading" | "error" | "permission-denied" | "offline" | "empty" | "populated";

/**
 * Resolves ONE of six states from REAL signals — never a guess:
 *  - loading            <- `query.isPending` (no data yet AND not errored —
 *    covers both "actively fetching" and "not enabled yet" / "gated behind
 *    another query," e.g. Phase 6 Slice 10's dashboard mount-refresh
 *    gating; see this function's own doc comment below for why this is
 *    `isPending`, not `isLoading`)
 *  - permission-denied  <- `query.error instanceof ApiError && error.status === 403`
 *    (the server's actual RBAC decision — see `lib/permissions.ts`'s own
 *    doc comment on why this, not a decoded-JWT guess, is the correct
 *    signal for route-content gating)
 *  - offline            <- a network-level failure (`isNetworkError`:
 *    `TypeError` from a failed fetch, or `navigator.onLine === false`)
 *  - error               <- any other `query.isError`
 *  - empty               <- `!isPending && !isError && isEmptyData(data)`
 *  - populated           <- else
 *
 * Each dashboard widget gets its OWN `<QueryBoundary>` instance (per
 * docs/phase-6/PROGRESS.md's scope item 8) so one failing widget never
 * blanks the whole page.
 *
 * **`isPending`, not `isLoading` (Phase 6 Slice 10 fix)**: TanStack Query
 * v5 defines `isLoading = isPending && isFetching` (confirmed by reading
 * `@tanstack/query-core`'s own `queryObserver.js` directly) — a query that
 * is `enabled: false` and has never fetched (`data === undefined`) has
 * `isPending: true` but `isFetching: false`, so `isLoading` is FALSE for
 * it. The old `isLoading`-based check fell through to the `data ===
 * undefined` branch below and misreported that state as `empty` (a "no
 * data found" panel), not `loading` — harmless before this pass (nothing
 * used `enabled: false` in a way a real user would see the gap), but a
 * real, visible bug once the Dashboard's MV-backed KPI queries started
 * being gated behind the mount-refresh mutation: every page load would
 * flash "No data" panels on Outstanding Fees/Defaulters/Revenue/Wallet
 * Liability for the ~1-2s the refresh takes, before the real figures
 * appeared. `isPending` covers "no data yet" for BOTH reasons (actively
 * fetching, or not enabled yet) and is TanStack's own documented general
 * "do I have data" flag, making this the more correct general
 * implementation, not a special case bolted on for one caller.
 */
export function resolveQueryBoundaryState<T>(query: Pick<UseQueryResult<T, unknown>, "isPending" | "isError" | "error" | "data">, isEmptyData: (data: T) => boolean): QueryBoundaryState {
  if (query.isPending) return "loading";
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 403) return "permission-denied";
    if (isNetworkError(query.error)) return "offline";
    return "error";
  }
  if (query.data === undefined || isEmptyData(query.data)) return "empty";
  return "populated";
}

export interface QueryBoundaryProps<T> {
  query: Pick<UseQueryResult<T, unknown>, "isPending" | "isError" | "error" | "data" | "refetch">;
  children: (data: T) => React.ReactNode;
  isEmpty?: (data: T) => boolean;
  loadingFallback?: React.ReactNode;
  title?: string;
}

function defaultIsEmpty<T>(data: T): boolean {
  if (data === null || data === undefined) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === "object") return Object.keys(data as object).length === 0;
  return false;
}

export function QueryBoundary<T>({ query, children, isEmpty = defaultIsEmpty, loadingFallback, title }: QueryBoundaryProps<T>) {
  const t = useTranslations("queryBoundary");
  const tCommon = useTranslations("common");
  const state = resolveQueryBoundaryState(query, isEmpty);

  switch (state) {
    case "loading":
      // Slice 1.5b (visual polish iteration): a two-line shape (a short
      // label-width bar + a taller content-width block) reads as "a
      // card/section is loading" across every widget shape this app
      // actually uses (KPI tile, chart, table) better than one flat bar
      // did, without hardcoding a shape specific to any one of them. The
      // visually-hidden `role="status"`/`aria-live` text uses the
      // `queryBoundary.loadingTitle` key that already existed in every
      // locale file but was never actually rendered anywhere — a real,
      // if small, a11y gap (IR-004's screen-reader requirement) closed
      // here, not new copy invented for this pass.
      return (
        <div className="space-y-2" data-state="loading">
          <span className="sr-only" role="status" aria-live="polite">
            {t("loadingTitle")}
          </span>
          {loadingFallback ?? (
            <>
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-24 w-full" />
            </>
          )}
        </div>
      );

    case "permission-denied":
      // Slice 1.5b (visual polish iteration): permission-denied has no
      // retry affordance (there's nothing to retry — it's an RBAC wall,
      // not a transient failure), so it reads better as a centered
      // "resting state" panel than as a left-aligned actionable alert
      // banner. Reuses the exact tint-badge pattern KpiCard's tone icons
      // already established (`bg-tint-warning` + `text-warning`) rather
      // than inventing a new visual language.
      return (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-warning/30 bg-tint-warning px-6 py-10 text-center" data-state="permission-denied">
          {/* `bg-card` (opaque), not an opacity-modified `bg-background/NN` —
              this app's colors are raw `var(--x)` CSS custom properties, not
              Tailwind's RGB-triplet-with-`<alpha-value>` pattern, so `/NN`
              modifiers on them are silently dropped (a real, pre-existing
              limitation found while verifying this pass's own compiled CSS
              output — see docs/phase-6/PROGRESS.md's Slice 1.5b honest-notes
              section). `bg-card` gives real, guaranteed contrast against the
              surrounding `bg-tint-warning` panel instead. */}
          <span className="flex size-10 items-center justify-center rounded-full bg-card">
            <Lock className="size-5 text-warning" />
          </span>
          <p className="text-sm font-medium text-foreground">{t("permissionDeniedTitle")}</p>
          <p className="max-w-xs text-xs text-muted-foreground">{t("permissionDeniedDescription")}</p>
        </div>
      );

    case "offline":
      return (
        <Alert variant="destructive" data-state="offline">
          <WifiOff />
          <AlertTitle>{t("offlineTitle")}</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{t("offlineDescription")}</span>
            <Button size="sm" variant="outline" onClick={() => query.refetch()}>
              <RefreshCw />
              {tCommon("retry")}
            </Button>
          </AlertDescription>
        </Alert>
      );

    case "error":
      return (
        <Alert variant="destructive" data-state="error">
          <AlertTriangle />
          <AlertTitle>{title ?? t("errorTitle")}</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{query.error instanceof Error ? query.error.message : t("errorDescription")}</span>
            <Button size="sm" variant="outline" onClick={() => query.refetch()}>
              <RefreshCw />
            </Button>
          </AlertDescription>
        </Alert>
      );

    case "empty":
      // Slice 1.5b (visual polish iteration): same reasoning as
      // permission-denied above — an empty widget is a resting state, not
      // an error, so a spacious centered panel (icon in a tint badge, a
      // dashed border to read as "nothing placed here yet") fits better
      // than a left-aligned alert banner. Same real i18n copy as before,
      // just laid out differently.
      return (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center" data-state="empty">
          <span className="flex size-10 items-center justify-center rounded-full bg-tint-primary">
            <Inbox className="size-5 text-primary" />
          </span>
          <p className="text-sm font-medium text-foreground">{t("emptyTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("emptyDescription")}</p>
        </div>
      );

    case "populated":
      return <div data-state="populated">{children(query.data as T)}</div>;
  }
}

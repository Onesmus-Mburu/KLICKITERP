"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { ApiError } from "@/lib/api-error";
import { useRunWalletReconciliation, useWalletReconciliationStatus } from "@/features/wallet/hooks/use-reconciliation";
import type { WalletReconciliationResult } from "@/features/wallet/api/reconciliation.api";

function ReconciliationResultCard({ result }: { result: WalletReconciliationResult | null }) {
  const t = useTranslations("wallet.reconciliation");

  if (!result) {
    return <p className="text-sm text-muted-foreground">{t("neverRun")}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={result.ok ? "soft-success" : "soft-destructive"}>{result.ok ? t("ok") : t("variance")}</Badge>
        <span className="text-sm text-muted-foreground">{new Date(result.ranAt).toLocaleString()}</span>
        <span className="text-xs text-muted-foreground">{result.kind}</span>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">{t("findingsLabel")}</p>
        <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 text-xs">
          {JSON.stringify(result.findings, null, 2)}
        </pre>
      </div>
    </div>
  );
}

/**
 * Phase 6 Slice 11 (Part 3) — `wallet-reconciliation` (`wallet:reconciliation:run`,
 * the ONLY permission this controller has, for both routes). On-demand
 * only — no scheduler exists anywhere in this codebase (confirmed by
 * reading `ReconciliationController`'s own doc comment), so "Run
 * reconciliation now" is a real, deliberate admin action, not something
 * assumed to run in the background — mirrors the same "Process due
 * deliveries now" framing Part 4's webhooks screen will need for its own
 * unrelated no-scheduler gap.
 */
export default function WalletReconciliationPage() {
  const t = useTranslations("wallet.reconciliation");
  const statusQuery = useWalletReconciliationStatus();
  const runMutation = useRunWalletReconciliation();
  const [error, setError] = React.useState<string | null>(null);

  async function handleRun() {
    setError(null);
    try {
      await runMutation.mutateAsync();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <Button onClick={() => void handleRun()} disabled={runMutation.isPending}>
          <RefreshCw className={runMutation.isPending ? "size-4 animate-spin" : "size-4"} />
          {runMutation.isPending ? t("running") : t("runNow")}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("latestResultTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={statusQuery} isEmpty={() => false}>
            {(result) => <ReconciliationResultCard result={result} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}

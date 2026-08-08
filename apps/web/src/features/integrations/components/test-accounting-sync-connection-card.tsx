"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Zap } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { ACCOUNTING_SYNC_KINDS, type AccountingSyncKind } from "../api/sync.api";
import { useTestAccountingSyncConnection } from "../hooks/use-sync";

/**
 * `POST /integrations/sync/test-connection` — the REAL accounting-sync
 * connection test. Deliberately labeled distinctly from Module 2's own
 * "Test connection" button on `/settings/integrations` (a permanent stub for
 * `QUICKBOOKS`/`XERO`/`SAGE`, confirmed by reading
 * `IntegrationConfigService.stubTestFor()` directly — always
 * `"adapter not yet available, config saved"` for these three kinds,
 * regardless of what's configured). This one resolves the highest-priority
 * ENABLED config of the chosen kind and calls the real adapter's
 * `testConnection()` — a genuine outbound network attempt when a config is
 * enabled, or an honest "no config enabled, using log-only fallback" result
 * when none is — never the Module 2 stub message either way.
 */
export function TestAccountingSyncConnectionCard() {
  const t = useTranslations("settings.accountingSync");
  const [kind, setKind] = React.useState<AccountingSyncKind>("QUICKBOOKS");
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null);
  const testMutation = useTestAccountingSyncConnection();

  async function handleRun() {
    setError(null);
    setResult(null);
    try {
      setResult(await testMutation.mutateAsync(kind));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">{t("testConnectionTitle")}</CardTitle>
        <CardDescription>{t("testConnectionDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label required>{t("kindLabel")}</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as AccountingSyncKind)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNTING_SYNC_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={() => void handleRun()} disabled={testMutation.isPending}>
            <Zap className="size-4" />
            {testMutation.isPending ? t("testing") : t("testButton")}
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <Alert variant={result.ok ? "success" : "destructive"}>
            <AlertDescription>
              <span className="font-medium">{result.ok ? t("testResultOk") : t("testResultFailed")}:</span> {result.message}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

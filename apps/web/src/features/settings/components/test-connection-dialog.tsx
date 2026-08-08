"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Zap } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useTestIntegrationConfigConnection } from "../hooks/use-integration-configs";
import type { IntegrationConfig, TestConnectionResult } from "../types";

/**
 * FR-SET-003.1's "Test Connection button". A manual "Run test" step (not
 * auto-run on open) — same attempt-then-reveal shape every other mutating
 * confirm dialog in this app already uses (`<ClearChequeDialog>`, etc.), and
 * avoids re-triggering a real outbound network call every time this dialog
 * happens to be reopened.
 *
 * The result is carried IN a 2xx response body (`{ok, message}`), never an
 * HTTP error — `error` here only ever surfaces a genuine transport/auth/
 * permission failure of the TEST-CONNECTION CALL ITSELF, `result` surfaces
 * the real MPESA/stub outcome the plan asked to distinguish (a real Daraja
 * OAuth attempt now genuinely fails in this dev environment with no real
 * credentials/network — that is the expected, correct `result.ok === false`
 * case, shown here exactly as the server reported it, never re-worded).
 */
export function TestConnectionDialog({ config }: { config: IntegrationConfig }) {
  const t = useTranslations("settings.integrations");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<TestConnectionResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const testMutation = useTestIntegrationConfigConnection();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setResult(null);
      setError(null);
    }
  }

  async function handleRun() {
    setError(null);
    setResult(null);
    try {
      setResult(await testMutation.mutateAsync(config.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Zap className="size-4" />
          {t("testConnectionTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("testConnectionTitle", { name: config.name })}</DialogTitle>
          <DialogDescription>{t("testConnectionDescription")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <Alert variant={result.ok ? "success" : "destructive"}>
            <AlertDescription>{result.message}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("close")}
          </Button>
          <Button type="button" onClick={() => void handleRun()} disabled={testMutation.isPending}>
            {testMutation.isPending ? t("testing") : t("runTest")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

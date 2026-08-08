"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Play } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-error";
import { useProcessDueWebhookDeliveries } from "../hooks/use-webhook-deliveries";

/**
 * `POST /integrations/webhook-deliveries/process-due` — no scheduler exists
 * anywhere in this codebase (`WebhookDeliveryService`'s own class doc
 * comment: "no scheduler/worker exists anywhere in this codebase"), so this
 * is deliberately labeled as a MANUAL admin action, never implied to run
 * automatically in the background. Attempts every `PENDING`/`FAILED`
 * delivery whose `next_retry_at` has passed, partial-failure-tolerant.
 */
export function ProcessDueDeliveriesButton() {
  const t = useTranslations("settings.webhooks.deliveries");
  const mutation = useProcessDueWebhookDeliveries();
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ processed: number; failed: number } | null>(null);

  async function handleClick() {
    setError(null);
    setResult(null);
    try {
      setResult(await mutation.mutateAsync());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void handleClick()} disabled={mutation.isPending}>
          <Play className="size-4" />
          {mutation.isPending ? t("processing") : t("processDueButton")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("processDueHint")}</p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {result && (
        <Alert variant={result.failed > 0 ? "warning" : "success"}>
          <AlertDescription>{t("processDueResult", { processed: result.processed, failed: result.failed })}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

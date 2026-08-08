"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-error";
import { useRetryWebhookDelivery } from "../hooks/use-webhook-deliveries";

/** `POST /integrations/webhook-deliveries/{id}/retry` — a per-row manual "attempt this one right now, regardless of next_retry_at" action. */
export function RetryWebhookDeliveryButton({ id }: { id: string }) {
  const t = useTranslations("settings.webhooks.deliveries");
  const mutation = useRetryWebhookDelivery();
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick() {
    setError(null);
    try {
      await mutation.mutateAsync(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-1">
      <Button type="button" size="sm" variant="outline" onClick={() => void handleClick()} disabled={mutation.isPending}>
        <RotateCw className={mutation.isPending ? "size-4 animate-spin" : "size-4"} />
        {mutation.isPending ? t("retrying") : t("retryTrigger")}
      </Button>
      {error && <p className="max-w-[16rem] text-xs text-destructive">{error}</p>}
    </div>
  );
}

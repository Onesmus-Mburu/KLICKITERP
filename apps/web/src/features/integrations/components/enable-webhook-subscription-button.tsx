"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-error";
import { useEnableWebhookSubscription } from "../hooks/use-webhook-subscriptions";

/**
 * `POST /integrations/webhook-subscriptions/{id}/enable` — no body, no
 * confirm step needed (re-enabling is a reversible, non-destructive state
 * flip, the same "direct button + mutation" precedent
 * `<SetCurrentYearButton>` (`features/settings/components/set-current-year-button.tsx`)
 * already establishes for an analogous case). Also clears the subscription's
 * failure streak server-side (`WebhookSubscriptionsService.enable()`).
 */
export function EnableWebhookSubscriptionButton({ id }: { id: string }) {
  const t = useTranslations("settings.webhooks");
  const mutation = useEnableWebhookSubscription();
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
        <CheckCircle2 className="size-4" />
        {mutation.isPending ? t("enabling") : t("enableTrigger")}
      </Button>
      {error && <p className="max-w-[16rem] text-xs text-destructive">{error}</p>}
    </div>
  );
}

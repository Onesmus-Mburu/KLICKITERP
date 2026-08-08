"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import type { WebhookSubscriptionResponseDto } from "@klickit/contracts";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useUpdateWebhookSubscription } from "../hooks/use-webhook-subscriptions";
import { WebhookEventsPicker } from "./webhook-events-picker";

/**
 * `PATCH /integrations/webhook-subscriptions/{id}` — `UpdateWebhookSubscriptionDto`
 * only carries `url`/`events` (confirmed by reading `webhook-subscription.dto.ts`
 * directly); the secret is never editable here — use `<RotateWebhookSecretDialog>`.
 */
export function EditWebhookSubscriptionDialog({ subscription }: { subscription: WebhookSubscriptionResponseDto }) {
  const t = useTranslations("settings.webhooks");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [url, setUrl] = React.useState(subscription.url);
  const [events, setEvents] = React.useState<string[]>(subscription.events);
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateWebhookSubscription();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setUrl(subscription.url);
      setEvents(subscription.events);
      setError(null);
    }
  }

  const canSubmit = url.trim().length > 0 && events.length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await updateMutation.mutateAsync({ id: subscription.id, input: { url: url.trim(), events } });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Pencil className="size-4" />
          {tCommon("edit")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("editSubscriptionTitle")}</DialogTitle>
          <DialogDescription>{t("editSubscriptionDescription")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label required>{t("url")}</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} maxLength={300} />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("events")}</Label>
            <WebhookEventsPicker selected={events} onChange={setEvents} disabled={updateMutation.isPending} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || updateMutation.isPending}>
            {updateMutation.isPending ? t("saving") : t("saveButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
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
import { useCreateWebhookSubscription } from "../hooks/use-webhook-subscriptions";
import { WebhookEventsPicker } from "./webhook-events-picker";

const MIN_SECRET_LENGTH = 8;

/**
 * `POST /integrations/webhook-subscriptions` (`integrations:webhook:manage`)
 * — url + secret (min 8 chars, `type="password"` masked — never shown again
 * after saving, same "resubmit, don't pre-fill" discipline Module 2's own
 * MPESA secret handling established) + events (`<WebhookEventsPicker>`,
 * `@ArrayMinSize(1)`) + isActive (defaults true).
 */
export function NewWebhookSubscriptionDialog() {
  const t = useTranslations("settings.webhooks");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [url, setUrl] = React.useState("");
  const [secret, setSecret] = React.useState("");
  const [events, setEvents] = React.useState<string[]>([]);
  const [isActive, setIsActive] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const createMutation = useCreateWebhookSubscription();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setUrl("");
      setSecret("");
      setEvents([]);
      setIsActive(true);
      setError(null);
    }
  }

  const canSubmit = url.trim().length > 0 && secret.length >= MIN_SECRET_LENGTH && events.length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await createMutation.mutateAsync({ url: url.trim(), secret, events, isActive });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="size-4" />
          {t("newSubscription")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("newSubscriptionTitle")}</DialogTitle>
          <DialogDescription>{t("newSubscriptionDescription")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label required>{t("url")}</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t("urlPlaceholder")} maxLength={300} />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("secret")}</Label>
            <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={t("secretPlaceholder")} />
            <p className="text-xs text-muted-foreground">{t("secretHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("events")}</Label>
            <WebhookEventsPicker selected={events} onChange={setEvents} disabled={createMutation.isPending} />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="size-4 rounded border-input" />
            {t("isActiveLabel")}
          </label>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? t("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

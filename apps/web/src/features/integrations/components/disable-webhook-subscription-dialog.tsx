"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Ban } from "lucide-react";
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
import { useDisableWebhookSubscription } from "../hooks/use-webhook-subscriptions";

/** `POST /integrations/webhook-subscriptions/{id}/disable {reason}` — `DisableWebhookSubscriptionDto.reason` is required (`@IsString() @MaxLength(300)`, no `@IsOptional()`, confirmed by reading the DTO directly). */
export function DisableWebhookSubscriptionDialog({ subscription }: { subscription: WebhookSubscriptionResponseDto }) {
  const t = useTranslations("settings.webhooks");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const disableMutation = useDisableWebhookSubscription();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setReason("");
      setError(null);
    }
  }

  const canSubmit = reason.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await disableMutation.mutateAsync({ id: subscription.id, reason: reason.trim() });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Ban className="size-4" />
          {t("disableTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("disableTitle")}</DialogTitle>
          <DialogDescription>{t("disableDescription")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label required>{t("reasonLabel")}</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} maxLength={300} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={() => void handleSubmit()} disabled={!canSubmit || disableMutation.isPending}>
            {disableMutation.isPending ? t("disabling") : t("disableButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

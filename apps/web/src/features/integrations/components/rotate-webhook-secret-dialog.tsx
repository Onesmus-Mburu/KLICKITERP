"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { KeyRound } from "lucide-react";
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
import { useRotateWebhookSecret } from "../hooks/use-webhook-subscriptions";

const MIN_SECRET_LENGTH = 8;

/**
 * `POST /integrations/webhook-subscriptions/{id}/rotate-secret` — the
 * dedicated write-once secret-replace flow: the OLD secret is never fetched,
 * never shown, never pre-filled here (it genuinely can't be — `secret_enc`
 * only decrypts server-side, at delivery-signing time). A brand-new secret
 * must be typed in full, exactly the "resubmit, don't pre-fill" honesty
 * Module 2's own MPESA credential handling already established.
 */
export function RotateWebhookSecretDialog({ subscription }: { subscription: WebhookSubscriptionResponseDto }) {
  const t = useTranslations("settings.webhooks");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [secret, setSecret] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const rotateMutation = useRotateWebhookSecret();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setSecret("");
      setError(null);
    }
  }

  const canSubmit = secret.length >= MIN_SECRET_LENGTH;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await rotateMutation.mutateAsync({ id: subscription.id, secret });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <KeyRound className="size-4" />
          {t("rotateSecretTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("rotateSecretTitle")}</DialogTitle>
          <DialogDescription>{t("rotateSecretDescription")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label required>{t("newSecretLabel")}</Label>
          <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={t("secretPlaceholder")} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || rotateMutation.isPending}>
            {rotateMutation.isPending ? t("rotating") : t("rotateButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

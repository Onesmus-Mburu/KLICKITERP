"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { usePostInvoice } from "../hooks/use-invoices";
import { isGlNotConfiguredError } from "../lib/errors";

/**
 * `POST /billing/invoices/:id/post` — no approval gate, realizes the GL
 * posting directly (per the plan). Two distinct failure surfaces, per the
 * plan's explicit instruction NOT to render them as one generic error:
 *  - a real 404 when a required GL control account (e.g. `AR_STUDENT`)
 *    isn't configured — rendered as a dedicated, persistent
 *    "GL not configured, contact your administrator" `<Alert>`, not a
 *    transient inline message, since this is a configuration problem the
 *    CURRENT user typically can't self-resolve by retrying.
 *  - everything else falls back to a plain inline error message.
 */
export function PostInvoiceButton({ invoiceId, studentId }: { invoiceId: string; studentId: string }) {
  const t = useTranslations("billing.invoices.detail");
  const [error, setError] = React.useState<string | null>(null);
  const [glNotConfigured, setGlNotConfigured] = React.useState(false);
  const postMutation = usePostInvoice(invoiceId, studentId);

  async function handlePost() {
    setError(null);
    setGlNotConfigured(false);
    try {
      await postMutation.mutateAsync();
    } catch (err) {
      if (isGlNotConfiguredError(err)) {
        setGlNotConfigured(true);
        return;
      }
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-2">
      {glNotConfigured && (
        <Alert variant="warning">
          <AlertTitle>{t("glNotConfiguredTitle")}</AlertTitle>
          <AlertDescription>{t("glNotConfiguredDescription")}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="button" onClick={handlePost} disabled={postMutation.isPending}>
        <Send className="size-4" />
        {postMutation.isPending ? t("posting") : t("post")}
      </Button>
    </div>
  );
}

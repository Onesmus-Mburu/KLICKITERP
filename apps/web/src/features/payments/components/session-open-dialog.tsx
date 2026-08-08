"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/patterns/money-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { DEFAULT_CURRENCY, normalizeMoneyInput } from "@/lib/money";
import { useOpenSession } from "../hooks/use-sessions";
import { isSessionAlreadyOpenError } from "../lib/errors";

/** `POST /payments/sessions/open` (`payments:session:open`) — BR-PAY-04 (at most one OPEN session per cashier, DB-enforced). Reachable from both the payments landing page and the persistent topbar `<SessionStatusWidget>`. */
export function SessionOpenDialog({ trigger }: { trigger?: React.ReactNode }) {
  const t = useTranslations("payments.sessionOpen");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [till, setTill] = React.useState("");
  const [floatAmount, setFloatAmount] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const openMutation = useOpenSession();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setTill("");
      setFloatAmount("");
      setError(null);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!till.trim()) {
      setError(t("tillRequired"));
      return;
    }
    const normalizedFloat = normalizeMoneyInput(floatAmount);
    if (normalizedFloat === null) {
      setError(t("floatRequired"));
      return;
    }
    try {
      await openMutation.mutateAsync({ till: till.trim(), floatAmount: normalizedFloat });
      setOpen(false);
    } catch (err) {
      if (isSessionAlreadyOpenError(err)) {
        setError(t("alreadyOpenError"));
        return;
      }
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger ?? <Button type="button">{t("trigger")}</Button>}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label required>{t("till")}</Label>
          <Input value={till} onChange={(e) => setTill(e.target.value)} placeholder={t("tillPlaceholder")} maxLength={30} />
        </div>
        <div className="space-y-1.5">
          <Label required>{t("floatAmount")}</Label>
          <MoneyInput value={floatAmount} onValueChange={(v) => setFloatAmount(v ?? "")} currency={DEFAULT_CURRENCY} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={openMutation.isPending}>
            {openMutation.isPending ? t("opening") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

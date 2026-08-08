"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { UserResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/patterns/money-input";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { ApiError } from "@/lib/api-error";
import { useSetAuthorityLimit } from "../hooks/use-users";

/**
 * `PATCH /users/:id/authority-limit` (`users:user:set-authority-limit`,
 * FR-USER-005.1, `SetAuthorityLimitDto{amount?: string|null}` — a decimal
 * string KES, `null` clears). An empty `<MoneyInput>` submits `null`,
 * mirroring `UpdateLimitsDialog`'s own nullable-money-field precedent
 * exactly (`features/wallet/components/update-limits-dialog.tsx`).
 */
export function SetAuthorityLimitDialog({ user }: { user: UserResponseDto }) {
  const t = useTranslations("users.setAuthorityLimitDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState<string | null>(user.authorityLimitAmount);
  const [error, setError] = React.useState<string | null>(null);
  const mutation = useSetAuthorityLimit();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setAmount(user.authorityLimitAmount);
      setError(null);
    }
  }

  async function handleSubmit() {
    setError(null);
    try {
      await mutation.mutateAsync({ id: user.id, dto: { amount } });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {t("trigger")}
        </Button>
      </DialogTrigger>
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
          <Label>{t("amountLabel")}</Label>
          <MoneyInput value={amount ?? ""} onValueChange={setAmount} currency={DEFAULT_CURRENCY} />
          <p className="text-xs text-muted-foreground">{t("clearHint")}</p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={mutation.isPending}>
            {mutation.isPending ? t("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/patterns/money-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { useServicePoints } from "../hooks/use-service-points";
import { useSpendWallet } from "../hooks/use-wallets";

/**
 * Phase 6 Slice 11 (Part 2) — `POST wallets/:id/spend` (P-14, "full
 * limit-check gauntlet" per that endpoint's own `@ApiOperation` summary — a
 * LOCKED/FROZEN wallet, a daily/txn limit breach, a category block, or an
 * overdraft-floor breach all surface here as a real, generic `err.message`,
 * not specially parsed — matches the plan's "surface it as-is" discipline
 * used everywhere else in this dispatch). The service-point `<Select>` is a
 * plain read-only picker against `GET /wallet-service-points`
 * (`useServicePoints()`) — full Service Points management (create/edit,
 * operator assignment) is explicitly Part 3's job.
 */
export function SpendDialog({ walletId, studentId }: { walletId: string; studentId?: string }) {
  const t = useTranslations("wallet.spend");
  const tSpType = useTranslations("wallet.servicePointTypes");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState<string | null>(null);
  const [servicePointId, setServicePointId] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);
  const servicePointsQuery = useServicePoints();
  const mutation = useSpendWallet(walletId, studentId);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setAmount(null);
      setServicePointId("");
      setError(null);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!amount || !servicePointId) {
      setError(t("validationError"));
      return;
    }
    try {
      await mutation.mutateAsync({ amount, servicePointId, idempotencyKey: crypto.randomUUID() });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  const servicePoints = servicePointsQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">{t("trigger")}</Button>
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

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("servicePointLabel")}</Label>
            <Select value={servicePointId} onValueChange={setServicePointId}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectServicePoint")} />
              </SelectTrigger>
              <SelectContent>
                {servicePoints
                  .filter((sp) => sp.isActive)
                  .map((sp) => (
                    <SelectItem key={sp.id} value={sp.id}>
                      {sp.name} ({tSpType(sp.type)})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("amountLabel")}</Label>
            <MoneyInput value={amount ?? ""} onValueChange={setAmount} currency={DEFAULT_CURRENCY} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={mutation.isPending}>
            {mutation.isPending ? t("submitting") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

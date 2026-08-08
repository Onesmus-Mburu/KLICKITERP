"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { SETTABLE_WALLET_STATUSES, type SettableWalletStatus } from "../constants";
import { useSetWalletStatus } from "../hooks/use-wallets";

/**
 * Phase 6 Slice 11 (Part 2) — `POST wallets/:id/status`. `SetWalletStatusDto.status`
 * deliberately excludes CLOSED (`SETTABLE_WALLET_STATUSES`) — CLOSED is only
 * reachable via the separate Close Wallet dialog/disposition flow.
 */
export function SetStatusDialog({ walletId, currentStatus, studentId }: { walletId: string; currentStatus: string; studentId?: string }) {
  const t = useTranslations("wallet.setStatus");
  const tStatus = useTranslations("wallet.status");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState<SettableWalletStatus>(
    (SETTABLE_WALLET_STATUSES as readonly string[]).includes(currentStatus) ? (currentStatus as SettableWalletStatus) : "ACTIVE",
  );
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const mutation = useSetWalletStatus(walletId, studentId);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setStatus((SETTABLE_WALLET_STATUSES as readonly string[]).includes(currentStatus) ? (currentStatus as SettableWalletStatus) : "ACTIVE");
      setReason("");
      setError(null);
    }
  }

  async function handleSubmit() {
    setError(null);
    try {
      await mutation.mutateAsync({ status, reason: reason.trim() || undefined });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

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
          <p className="text-xs text-muted-foreground">
            {t("currentStatus")}: <span className="font-medium text-foreground">{tStatus(currentStatus)}</span>
          </p>
          <div className="space-y-1.5">
            <Label required>{t("statusLabel")}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as SettableWalletStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SETTABLE_WALLET_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {tStatus(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("reasonLabel")}</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={mutation.isPending || status === currentStatus}>
            {mutation.isPending ? t("submitting") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

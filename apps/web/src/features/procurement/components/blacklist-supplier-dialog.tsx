"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Ban } from "lucide-react";
import type { SupplierResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-error";
import { useBlacklistSupplier } from "../hooks/use-suppliers";

/**
 * Phase 6 Slice 18 Part 1 (Procurement, Module 12) — BR-PROC-05: blocks new
 * POs against this supplier. A confirm dialog requiring a real reason,
 * mirroring `features/accounting/components/reverse-journal-dialog.tsx`'s
 * own required-text-field confirm-dialog shape (`BlacklistSupplierDto.reason`
 * is required, `@MinLength(1)`, so the dialog can't be confirmed with it
 * empty). Reactivate is the OPPOSITE shape — a plain no-body POST — and is
 * rendered as a direct-click button on the detail page itself, matching this
 * codebase's established "no-body action = direct click, body-required
 * action = confirm dialog" split (e.g. `period-status-actions.tsx`'s own
 * Open/Soft-Close vs. Hard-Close treatment), not a second dialog here.
 */
export function BlacklistSupplierDialog({ supplier }: { supplier: SupplierResponseDto }) {
  const t = useTranslations("procurement.suppliers.blacklistDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const blacklistMutation = useBlacklistSupplier();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setReason("");
      setError(null);
    }
  }

  async function handleConfirm() {
    if (!reason.trim()) return;
    setError(null);
    try {
      await blacklistMutation.mutateAsync({ id: supplier.id, reason: reason.trim() });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive">
          <Ban className="size-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { name: supplier.name })}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label required>{t("reasonLabel")}</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={() => void handleConfirm()} disabled={!reason.trim() || blacklistMutation.isPending}>
            {blacklistMutation.isPending ? t("blacklisting") : t("confirmButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { RefreshCcw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useRequestReplenishment } from "../hooks/use-petty-cash";

/**
 * Phase 6 Slice 20 Part 2 (Petty Cash, Module 14) — `requestReplenishment()`
 * takes no request body at all (server-side, purely `floatId` + caller —
 * see `petty-cash.api.ts`'s own doc comment), so this is a confirm-and-go
 * button behind a dialog rather than a real form (the task brief explicitly
 * left this choice open — a form would have nothing to collect). The confirm
 * step still earns its place: the server computes `amount`/`voucherIds`
 * itself and can reject with a real 422 when there are zero unclaimed
 * APPROVED vouchers (`PettyCashService.requestReplenishment()`'s own check)
 * — a plain unconfirmed button would surface that failure with no
 * explanation of what was even attempted, the same reasoning every other
 * confirm-gated action in this codebase (`voucher-status-actions.tsx`'s own
 * submit/approve/reject/pay) already establishes.
 */
export function RequestReplenishmentDialog({ floatId }: { floatId: string }) {
  const t = useTranslations("expenses.pettyCash.requestReplenishmentDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const requestMutation = useRequestReplenishment();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  async function handleRequest() {
    setError(null);
    try {
      await requestMutation.mutateAsync(floatId);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <RefreshCcw className="size-4" />
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

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleRequest()} disabled={requestMutation.isPending}>
            {requestMutation.isPending ? t("requesting") : t("requestButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

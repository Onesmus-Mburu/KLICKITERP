"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { PlayCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { pickLatestInstanceForEntity } from "../lib/reversal";
import { useRefundSuspenseItem, type useSuspenseRefundInstance } from "../hooks/use-suspense";
import type { SuspenseItem } from "../types";

type RefundInstanceQuery = ReturnType<typeof useSuspenseRefundInstance>;

/**
 * Cloned from `execute-reversal-dialog.tsx`, with the ONE real DTO
 * difference the plan flags: `ReverseSuspenseRefundDto` has only
 * `approvalRef`, no `reasonCode` (confirmed directly in `suspense.dto.ts`) —
 * so there is no reason `<Select>` here, unlike `<ExecuteReversalDialog>`.
 * "Always use the freshest instance" is preserved verbatim: refetches the
 * domain list and re-derives the latest matching instance immediately before
 * calling execute, rather than trusting whatever was rendered.
 */
export function ExecuteSuspenseRefundDialog({
  suspenseItemId,
  refundQuery,
  onRefunded,
}: {
  suspenseItemId: string;
  refundQuery: RefundInstanceQuery;
  onRefunded: (item: SuspenseItem) => void;
}) {
  const t = useTranslations("payments.suspense.refund");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const refundMutation = useRefundSuspenseItem(suspenseItemId);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  async function handleExecute() {
    setError(null);
    const fresh = await refundQuery.refetch();
    const freshest = pickLatestInstanceForEntity(fresh.data ?? [], suspenseItemId);
    if (!freshest || freshest.status !== "APPROVED") {
      setError(t("noLongerApprovedError"));
      return;
    }
    try {
      const item = await refundMutation.mutateAsync({ approvalRef: freshest.id });
      setOpen(false);
      onRefunded(item);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("executeGenericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <PlayCircle className="size-4" />
          {t("executeTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("executeTitle")}</DialogTitle>
          <DialogDescription>{t("executeDescription")}</DialogDescription>
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
          <Button type="button" onClick={() => void handleExecute()} disabled={refundMutation.isPending}>
            {refundMutation.isPending ? t("executing") : t("executeConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

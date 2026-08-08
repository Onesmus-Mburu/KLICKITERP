"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Rocket } from "lucide-react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { usePublishFeeStructure } from "../hooks/use-fee-structures";

/**
 * `POST /billing/fee-structures/:id/publish` (BR-BILL-03) — flips
 * `DRAFT -> PUBLISHED`, a one-way transition (no unpublish endpoint exists,
 * confirmed by reading `fee-structures.controller.ts`), so this gets a real
 * confirm dialog, same trigger+confirm-`Dialog`+error-banner shape
 * `DeleteClassButton`/`exit-clear-action.tsx` already established for
 * consequential actions in this codebase. `billing:fee-structure:publish`
 * is a DISTINCT permission from `:manage` (confirmed in the controller) — a
 * user who can add lines but not publish gets a real 403 here, rendered as
 * the dialog's own error banner, not a silently-disabled/hidden button.
 */
export function PublishFeeStructureButton({ structureId }: { structureId: string }) {
  const t = useTranslations("billing.feeStructures.publishDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const mutation = usePublishFeeStructure(structureId);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  async function handleConfirm() {
    setError(null);
    try {
      await mutation.mutateAsync();
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" className="print:hidden">
          <Rocket className="size-4" />
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
          <Button type="button" onClick={handleConfirm} disabled={mutation.isPending}>
            {mutation.isPending ? t("publishing") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

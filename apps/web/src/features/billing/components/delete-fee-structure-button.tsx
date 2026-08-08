"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import type { FeeStructureResponseDto } from "@klickit/contracts";
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
import { useDeleteFeeStructure } from "../hooks/use-fee-structures";

/**
 * Real delete action for a `bill_fee_structure` row (Phase 6 Slice 3b) —
 * same trigger+confirm-dialog+error-banner shape `DeleteClassButton`/
 * `DeleteStudentButton` already established, not a new pattern. The confirm
 * dialog names the specific structure (class name + version) before
 * anything is sent — a genuinely destructive, non-reversible action. A real
 * `409` (`FeeStructuresService.delete()`'s own invoice-count pre-check)
 * renders as a DIALOG-LEVEL error banner with the backend's own specific
 * message (`ApiError.message`, e.g. "Cannot delete fee structure ...: 3
 * invoice(s) still reference it") — matching `DeleteClassButton`'s own
 * documented reasoning for why this doesn't go through `parseFieldErrors`.
 *
 * `redirectOnSuccess` — the detail page passes this so a successful delete
 * navigates back to the list (there is no more detail to show); the list
 * page's row action omits it (the row just disappears via the query
 * invalidation `useDeleteFeeStructure` already does).
 */
export function DeleteFeeStructureButton({
  structure,
  scopeLabel,
  redirectOnSuccess,
}: {
  structure: FeeStructureResponseDto;
  scopeLabel: string;
  redirectOnSuccess?: boolean;
}) {
  const t = useTranslations("billing.feeStructures.deleteDialog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const mutation = useDeleteFeeStructure();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  async function handleConfirm() {
    setError(null);
    try {
      await mutation.mutateAsync(structure.id);
      setOpen(false);
      if (redirectOnSuccess) router.push("/billing/fee-structures");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-destructive hover:bg-tint-destructive hover:text-destructive print:hidden">
          <Trash2 className="size-4" />
          {tCommon("delete")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { scope: scopeLabel, version: structure.version })}</DialogDescription>
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
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={mutation.isPending}>
            {mutation.isPending ? t("deleting") : tCommon("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

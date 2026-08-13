"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ResolveMatchExceptionDto, SupplierInvoiceResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api-error";
import { useResolveSupplierInvoiceException } from "../hooks/use-supplier-invoices";

type Resolution = ResolveMatchExceptionDto["resolution"];

/**
 * Phase 6 Slice 18 Part 4 (Procurement, Module 12) — `POST
 * .../resolve-exception`, only meaningful when `status='MATCH_EXCEPTION'`
 * (`<InvoiceMatchPanel>` only renders this dialog's trigger in that state).
 * A required-note confirm dialog offering both choices — the same
 * two-button segmented control `create-po-dialog.tsx`'s source toggle /
 * `revise-po-dialog.tsx`'s lines-mode toggle already established (no
 * `RadioGroup` primitive exists in `components/ui/` yet) — plus a required
 * `note` textarea, mirroring `blacklist-supplier-dialog.tsx`'s own
 * required-reason confirm-dialog shape (`ResolveMatchExceptionDto.note` is
 * `@MinLength(1)`, so the dialog can't be confirmed with it empty).
 *
 * `ACCEPT_VARIANCE` -> `MATCHED` (an authorized override, ready to `post()`);
 * `REJECT` -> `UNMATCHED` (back for correction — `matchAgainstPo()` can be
 * re-run once the underlying data is fixed, e.g. after a follow-up GRN is
 * posted). The confirm button's own variant switches to `destructive` for
 * `REJECT`, matching `po-status-actions.tsx`'s own reject-button styling.
 */
export function ResolveExceptionDialog({ invoice }: { invoice: SupplierInvoiceResponseDto }) {
  const t = useTranslations("procurement.supplierInvoices.resolveDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [resolution, setResolution] = React.useState<Resolution>("ACCEPT_VARIANCE");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const resolveMutation = useResolveSupplierInvoiceException();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setResolution("ACCEPT_VARIANCE");
      setNote("");
      setError(null);
    }
  }

  const canSubmit = note.trim().length > 0 && !resolveMutation.isPending;

  async function handleConfirm() {
    if (!canSubmit) return;
    setError(null);
    try {
      await resolveMutation.mutateAsync({ id: invoice.id, dto: { resolution, note: note.trim() } });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { number: invoice.number })}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label required>{t("resolutionLabel")}</Label>
          <div className="inline-flex overflow-hidden rounded-lg border border-input">
            <button
              type="button"
              onClick={() => setResolution("ACCEPT_VARIANCE")}
              className={cn("px-3 py-1.5 text-sm font-medium", resolution === "ACCEPT_VARIANCE" ? "bg-primary text-primary-foreground" : "bg-background text-foreground")}
            >
              {t("acceptVarianceOption")}
            </button>
            <button
              type="button"
              onClick={() => setResolution("REJECT")}
              className={cn("border-l border-input px-3 py-1.5 text-sm font-medium", resolution === "REJECT" ? "bg-primary text-primary-foreground" : "bg-background text-foreground")}
            >
              {t("rejectOption")}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{resolution === "ACCEPT_VARIANCE" ? t("acceptVarianceHint") : t("rejectHint")}</p>
        </div>

        <div className="space-y-1.5">
          <Label required>{t("noteLabel")}</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button
            type="button"
            variant={resolution === "REJECT" ? "destructive" : "default"}
            onClick={() => void handleConfirm()}
            disabled={!canSubmit}
          >
            {resolveMutation.isPending ? t("resolving") : t("confirmButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

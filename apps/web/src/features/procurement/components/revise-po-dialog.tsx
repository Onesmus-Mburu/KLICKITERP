"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { History } from "lucide-react";
import type { RevisePurchaseOrderDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api-error";
import { useSuppliers } from "../hooks/use-suppliers";
import { usePurchaseOrderLines, useRevisePurchaseOrder, type PurchaseOrder } from "../hooks/use-purchase-orders";
import { isPoLineRowComplete, poLineRowsToDto, type PoLineFormRow } from "../lib/po-lines";
import { PoLineEditor } from "./po-line-editor";

const DELIVERY_TERMS_MAX_LENGTH = 1000;

type LinesMode = "keep" | "specify";

/**
 * Phase 6 Slice 18 Part 3 (Procurement, Module 12) — FR-PROC-004.1: creates a
 * new DRAFT PO superseding this one. Per the task brief's own explicit
 * choice point ("your call on whether the dialog can either 'keep existing
 * lines' or 'specify new lines', document which you built") — **this dialog
 * builds BOTH modes**, toggled by a plain two-button segmented control (same
 * hand-rolled shape `create-po-dialog.tsx`'s own source toggle uses, no
 * `Tabs`/`RadioGroup` primitive exists in this codebase yet):
 *  - "Keep existing lines" (default) — `dto.lines` is omitted entirely,
 *    `PurchaseOrdersService.revise()`'s own documented behavior carries the
 *    original's lines forward unchanged.
 *  - "Specify new lines" — lazily loads the ORIGINAL PO's own current lines
 *    (`usePurchaseOrderLines(po.id)`) as a real starting point the user can
 *    edit/add/remove via the shared `<PoLineEditor>`, and `dto.lines` is
 *    included on submit.
 *
 * `supplierId`/`deliveryTerms` are always editable, defaulting to the
 * original PO's own current values — both are always included in the
 * request body (sending the unchanged value back is a harmless no-op
 * server-side; simpler than a diff). **Honest gap**: there's no way to
 * explicitly NULL-clear `deliveryTerms` back to empty from here — blanking
 * the input just omits the field (leaving the original's value unchanged
 * server-side), the same documented, non-blocking limitation
 * `edit-supplier-dialog.tsx` (Part 1) already established for
 * `tradingName`/`kraPin`, since `RevisePurchaseOrderDto.deliveryTerms`'s
 * real contracts type is `string | undefined` (no `null` in the union).
 *
 * **Navigates to the NEW PO's detail page on success, not the original's** —
 * per the task brief's own explicit instruction; `useRevisePurchaseOrder()`'s
 * response is that new PO, never the one this dialog was opened from.
 */
export function RevisePoDialog({ po }: { po: PurchaseOrder }) {
  const t = useTranslations("procurement.purchaseOrders.reviseDialog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [supplierId, setSupplierId] = React.useState(po.supplierId);
  const [deliveryTerms, setDeliveryTerms] = React.useState(po.deliveryTerms ?? "");
  const [linesMode, setLinesMode] = React.useState<LinesMode>("keep");
  const [rows, setRows] = React.useState<PoLineFormRow[]>([]);
  const [rowsSeeded, setRowsSeeded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const suppliersQuery = useSuppliers("ACTIVE");
  const originalLinesQuery = usePurchaseOrderLines(linesMode === "specify" ? po.id : undefined);
  const reviseMutation = useRevisePurchaseOrder();

  const supplierItems = React.useMemo(() => (suppliersQuery.data ?? []).map((s) => ({ value: s.id, label: s.name })), [suppliersQuery.data]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setSupplierId(po.supplierId);
      setDeliveryTerms(po.deliveryTerms ?? "");
      setLinesMode("keep");
      setRows([]);
      setRowsSeeded(false);
      setError(null);
    }
  }

  function handleLinesModeChange(next: LinesMode) {
    setLinesMode(next);
  }

  // Seed the editor from the original PO's own current lines the first time
  // "specify new lines" mode's own query resolves — a one-time copy, not a
  // live sync, so further edits in `<PoLineEditor>` aren't clobbered by a
  // background refetch.
  React.useEffect(() => {
    if (linesMode === "specify" && !rowsSeeded && originalLinesQuery.data) {
      setRows(
        originalLinesQuery.data.map((line) => ({ key: crypto.randomUUID(), description: line.description, qty: line.qty, unitPrice: line.unitPrice })),
      );
      setRowsSeeded(true);
    }
  }, [linesMode, rowsSeeded, originalLinesQuery.data]);

  const linesComplete = linesMode === "keep" || (rows.length > 0 && rows.every(isPoLineRowComplete));
  const canSubmit = !!supplierId && linesComplete && !reviseMutation.isPending && !(linesMode === "specify" && !rowsSeeded && originalLinesQuery.isPending);

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: RevisePurchaseOrderDto = {
      supplierId,
      ...(deliveryTerms.trim() ? { deliveryTerms: deliveryTerms.trim() } : {}),
      ...(linesMode === "specify" ? { lines: poLineRowsToDto(rows) } : {}),
    };
    try {
      const revised = await reviseMutation.mutateAsync({ id: po.id, dto });
      setOpen(false);
      router.push(`/procurement/purchase-orders/${revised.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <History className="size-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { number: po.number })}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("supplierLabel")}</Label>
              <Combobox
                items={supplierItems}
                value={supplierId}
                onChange={setSupplierId}
                placeholder={suppliersQuery.isLoading ? t("loadingSuppliers") : t("selectSupplierPlaceholder")}
                searchPlaceholder={t("searchSuppliers")}
                emptyText={t("noSuppliersFound")}
                disabled={suppliersQuery.isLoading}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("deliveryTermsLabel")}</Label>
              <Input
                value={deliveryTerms}
                maxLength={DELIVERY_TERMS_MAX_LENGTH}
                onChange={(e) => setDeliveryTerms(e.target.value)}
                placeholder={t("deliveryTermsPlaceholder")}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("linesModeLabel")}</Label>
            <div className="inline-flex overflow-hidden rounded-lg border border-input">
              <button
                type="button"
                onClick={() => handleLinesModeChange("keep")}
                className={cn("px-3 py-1.5 text-sm font-medium", linesMode === "keep" ? "bg-primary text-primary-foreground" : "bg-background text-foreground")}
              >
                {t("linesModeKeep")}
              </button>
              <button
                type="button"
                onClick={() => handleLinesModeChange("specify")}
                className={cn("border-l border-input px-3 py-1.5 text-sm font-medium", linesMode === "specify" ? "bg-primary text-primary-foreground" : "bg-background text-foreground")}
              >
                {t("linesModeSpecify")}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{linesMode === "keep" ? t("linesModeKeepHint") : t("linesModeSpecifyHint")}</p>
          </div>

          {linesMode === "specify" && (rowsSeeded ? <PoLineEditor rows={rows} onChange={setRows} /> : <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>)}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {reviseMutation.isPending ? t("revising") : t("reviseButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreatePurchaseOrderDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api-error";
import { useRequisitions } from "../hooks/use-requisitions";
import { useSuppliers } from "../hooks/use-suppliers";
import { getQuotationLines } from "../api/quotations.api";
import { useQuotationsByRequisition } from "../hooks/use-quotations";
import { useCreatePurchaseOrder, useCreatePurchaseOrderDirect } from "../hooks/use-purchase-orders";
import { emptyPoLineRow, isPoLineRowComplete, poLineRowsToDto, type PoLineFormRow } from "../lib/po-lines";
import { PoLineEditor } from "./po-line-editor";

const DELIVERY_TERMS_MAX_LENGTH = 1000;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

type Source = "requisition" | "direct";

/**
 * Phase 6 Slice 18 Part 3 (Procurement, Module 12) — ONE flexible dialog
 * covering all 3 PO-creation shapes the task brief lists (from a requisition,
 * from a requisition + its awarded quotation, and BR-PROC-01's direct
 * bypass), rather than 2 separate dialog components — documented choice: the
 * requisition-based (`POST /purchase-orders`) and direct
 * (`POST /purchase-orders/direct`) routes share the exact same
 * `CreatePurchaseOrderDto` body shape and every field in this form (supplier
 * picker, order date, delivery terms, `<PoLineEditor>`) is identical between
 * them — the ONLY real difference is which id (`requisitionId`) rides along
 * and which endpoint receives it. Splitting this into two dialog components
 * would duplicate the entire form for one boolean's worth of difference.
 *
 * **Two ways this gets opened**:
 *  - With a `requisitionId` prop (from `requisitions/[id]/page.tsx`'s own
 *    "Create purchase order" action on an APPROVED requisition) — the source
 *    is locked to "From requisition" against that exact id, no picker shown.
 *  - Bare (from `purchase-orders/page.tsx`'s "New purchase order" button) —
 *    a source toggle (plain two-button segmented control; no `Tabs`/`RadioGroup`
 *    primitive exists anywhere in `components/ui/` yet, confirmed by listing
 *    that directory before reaching for a new dependency) lets the user pick
 *    "From requisition" (with its own APPROVED-requisition picker) or
 *    "Direct" — `procurement:po:create-direct` is a SEPARATE permission that
 *    may not be granted to every role; this dialog does NOT hide the Direct
 *    option client-side (no permission-list endpoint exists anywhere in this
 *    codebase to check against, the same standing limitation every nav-gating
 *    doc comment in this app already documents) — a role without it gets a
 *    real, honest 403 surfaced via `ApiError.message` on submit, not a
 *    silently hidden option.
 *
 * **Selecting an awarded quotation prefills supplier + lines** — once a
 * requisition is chosen (via prop or picker), `<AwardedQuotationPicker>`
 * offers only its ISAWARDED quotations (logically the only ones that make
 * sense to convert — the DTO itself doesn't enforce this). Choosing one
 * fetches its lines (`getQuotationLines()`, a one-shot call, not a live
 * hook — the picked value is copied into local form state once, then edited
 * independently) and pre-fills `supplierId`/`rows`; the user can still edit
 * everything afterward before submitting.
 */
export function CreatePoDialog({ requisitionId: lockedRequisitionId }: { requisitionId?: string }) {
  const t = useTranslations("procurement.purchaseOrders.createDialog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [source, setSource] = React.useState<Source>("requisition");
  const [pickedRequisitionId, setPickedRequisitionId] = React.useState("");
  const [quotationId, setQuotationId] = React.useState("");
  const [supplierId, setSupplierId] = React.useState("");
  const [orderDate, setOrderDate] = React.useState(todayIsoDate());
  const [deliveryTerms, setDeliveryTerms] = React.useState("");
  const [rows, setRows] = React.useState<PoLineFormRow[]>([emptyPoLineRow()]);
  const [error, setError] = React.useState<string | null>(null);
  const [prefillLoading, setPrefillLoading] = React.useState(false);

  const effectiveRequisitionId = lockedRequisitionId ?? (source === "requisition" ? pickedRequisitionId : "");

  const suppliersQuery = useSuppliers("ACTIVE");
  const approvedRequisitionsQuery = useRequisitions({ status: "APPROVED" });
  const quotationsQuery = useQuotationsByRequisition(effectiveRequisitionId || undefined);
  const createFromRequisitionMutation = useCreatePurchaseOrder();
  const createDirectMutation = useCreatePurchaseOrderDirect();
  const isPending = createFromRequisitionMutation.isPending || createDirectMutation.isPending;

  const supplierItems = React.useMemo(() => (suppliersQuery.data ?? []).map((s) => ({ value: s.id, label: s.name })), [suppliersQuery.data]);
  const awardedQuotations = React.useMemo(() => (quotationsQuery.data ?? []).filter((q) => q.isAwarded), [quotationsQuery.data]);

  function resetForm() {
    setSource("requisition");
    setPickedRequisitionId("");
    setQuotationId("");
    setSupplierId("");
    setOrderDate(todayIsoDate());
    setDeliveryTerms("");
    setRows([emptyPoLineRow()]);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) resetForm();
  }

  async function handleQuotationChange(id: string) {
    setQuotationId(id);
    const quotation = awardedQuotations.find((q) => q.id === id);
    if (!quotation) return;
    setSupplierId(quotation.supplierId);
    setPrefillLoading(true);
    try {
      const lines = await getQuotationLines(id);
      if (lines.length > 0) {
        setRows(lines.map((line) => ({ key: crypto.randomUUID(), description: line.description, qty: line.qty, unitPrice: line.unitPrice })));
      }
    } catch {
      // Best-effort convenience prefill only — if it fails, the user still has a real, empty line editor to fill in by hand.
    } finally {
      setPrefillLoading(false);
    }
  }

  const linesComplete = rows.length > 0 && rows.every(isPoLineRowComplete);
  const canSubmit =
    !!supplierId &&
    linesComplete &&
    (source === "direct" || !!effectiveRequisitionId) &&
    !isPending &&
    !prefillLoading;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: CreatePurchaseOrderDto = {
      ...(source === "requisition" ? { requisitionId: effectiveRequisitionId } : {}),
      ...(quotationId ? { quotationId } : {}),
      supplierId,
      ...(orderDate ? { orderDate } : {}),
      ...(deliveryTerms.trim() ? { deliveryTerms: deliveryTerms.trim() } : {}),
      lines: poLineRowsToDto(rows),
    };
    try {
      const created =
        source === "requisition" ? await createFromRequisitionMutation.mutateAsync(dto) : await createDirectMutation.mutateAsync(dto);
      setOpen(false);
      router.push(`/procurement/purchase-orders/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="size-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          {!lockedRequisitionId && (
            <div className="space-y-1.5">
              <Label>{t("sourceLabel")}</Label>
              <div className="inline-flex overflow-hidden rounded-lg border border-input">
                <button
                  type="button"
                  onClick={() => setSource("requisition")}
                  className={cn("px-3 py-1.5 text-sm font-medium", source === "requisition" ? "bg-primary text-primary-foreground" : "bg-background text-foreground")}
                >
                  {t("sourceFromRequisition")}
                </button>
                <button
                  type="button"
                  onClick={() => setSource("direct")}
                  className={cn("border-l border-input px-3 py-1.5 text-sm font-medium", source === "direct" ? "bg-primary text-primary-foreground" : "bg-background text-foreground")}
                >
                  {t("sourceDirect")}
                </button>
              </div>
              {source === "direct" && <p className="text-xs text-muted-foreground">{t("directHint")}</p>}
            </div>
          )}

          {source === "requisition" && !lockedRequisitionId && (
            <div className="space-y-1.5">
              <Label required>{t("requisitionLabel")}</Label>
              <Select value={pickedRequisitionId} onValueChange={setPickedRequisitionId} disabled={approvedRequisitionsQuery.isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={approvedRequisitionsQuery.isLoading ? t("loadingRequisitions") : t("selectRequisitionPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {(approvedRequisitionsQuery.data ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {source === "requisition" && effectiveRequisitionId && awardedQuotations.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t("quotationLabel")}</Label>
              <Select value={quotationId} onValueChange={(v) => void handleQuotationChange(v)} disabled={prefillLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectQuotationPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {awardedQuotations.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      {t("quotationOptionLabel", { total: q.total })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("quotationHint")}</p>
            </div>
          )}

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
              <Label>{t("orderDateLabel")}</Label>
              <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
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

          <div className="space-y-1.5">
            <Label required>{t("linesLabel")}</Label>
            <PoLineEditor rows={rows} onChange={setRows} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {isPending ? t("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

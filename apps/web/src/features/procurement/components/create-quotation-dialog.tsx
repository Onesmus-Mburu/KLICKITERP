"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreateQuotationDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-error";
import { useSuppliers } from "../hooks/use-suppliers";
import { useCreateQuotation } from "../hooks/use-quotations";
import { emptyPoLineRow, isPoLineRowComplete, poLineRowsToDto, type PoLineFormRow } from "../lib/po-lines";
import { PoLineEditor } from "./po-line-editor";

const TERMS_MAX_LENGTH = 2000; // CreateQuotationDto.terms has no server-side @MaxLength — a generous local cap only, matching Textarea's own established convention elsewhere in this codebase.

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Phase 6 Slice 18 Part 3 (Procurement, Module 12) — captures a quotation +
 * its lines atomically against one APPROVED requisition
 * (`QuotationsController.create()`). `requisitionId` is a required prop, not
 * a picker — this dialog is only ever opened FROM
 * `app/(erp)/procurement/quotations/page.tsx`, which is itself always
 * requisition-scoped (see that route's own doc comment for why no top-level
 * "any requisition" quotations screen exists).
 *
 * **Lines are captured once here and never editable afterward** —
 * `ProcQuotationLineEntity` has no update/delete route (confirmed by reading
 * `QuotationsController` directly, 5 routes total, none of them line-level
 * mutations) — unlike `requisition-line-editor.tsx`'s own per-line CRUD
 * against an existing DRAFT requisition. `<PoLineEditor>` (shared with PO
 * creation, see that component's own doc comment) is used here purely as a
 * local form-state editor; nothing is sent to the server until this whole
 * dialog's "Create quotation" button is pressed.
 */
export function CreateQuotationDialog({ requisitionId }: { requisitionId: string }) {
  const t = useTranslations("procurement.quotations.createDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [supplierId, setSupplierId] = React.useState("");
  const [quoteDate, setQuoteDate] = React.useState(todayIsoDate());
  const [validUntil, setValidUntil] = React.useState("");
  const [terms, setTerms] = React.useState("");
  const [rows, setRows] = React.useState<PoLineFormRow[]>([emptyPoLineRow()]);
  const [error, setError] = React.useState<string | null>(null);

  const suppliersQuery = useSuppliers("ACTIVE");
  const createMutation = useCreateQuotation();

  const supplierItems = React.useMemo(
    () => (suppliersQuery.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    [suppliersQuery.data],
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setSupplierId("");
      setQuoteDate(todayIsoDate());
      setValidUntil("");
      setTerms("");
      setRows([emptyPoLineRow()]);
      setError(null);
    }
  }

  const linesComplete = rows.length > 0 && rows.every(isPoLineRowComplete);
  const canSubmit = !!supplierId && !!quoteDate && linesComplete && !createMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: CreateQuotationDto = {
      requisitionId,
      supplierId,
      quoteDate,
      ...(validUntil ? { validUntil } : {}),
      ...(terms.trim() ? { terms: terms.trim() } : {}),
      lines: poLineRowsToDto(rows),
    };
    try {
      await createMutation.mutateAsync(dto);
      setOpen(false);
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

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
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
              <Label required>{t("quoteDateLabel")}</Label>
              <Input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("validUntilLabel")}</Label>
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("termsLabel")}</Label>
            <Textarea value={terms} maxLength={TERMS_MAX_LENGTH} onChange={(e) => setTerms(e.target.value)} rows={3} placeholder={t("termsPlaceholder")} />
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
            {createMutation.isPending ? t("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

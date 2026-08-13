"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import type { CaptureSupplierInvoiceDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyInput } from "@/components/patterns/money-input";
import { formatMoney, normalizeMoneyInput, sumMoneyStrings } from "@/lib/money";
import { ApiError } from "@/lib/api-error";
import { useSuppliers } from "../hooks/use-suppliers";
import { usePurchaseOrderLines, usePurchaseOrders, isDraftPlaceholderNumber } from "../hooks/use-purchase-orders";
import { useCaptureSupplierInvoice } from "../hooks/use-supplier-invoices";
import { multiplyDecimalStrings } from "../lib/po-lines";

const SUPPLIER_REF_MAX_LENGTH = 60; // CaptureSupplierInvoiceDto.supplierRef's own @ApiProperty({maxLength: 60}).

interface InvoiceLineFormRow {
  key: string;
  poLineId: string;
  qty: string;
  unitPrice: string;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyRow(): InvoiceLineFormRow {
  return { key: crypto.randomUUID(), poLineId: "", qty: "1", unitPrice: "" };
}

/**
 * Phase 6 Slice 18 Part 4 (Procurement, Module 12) — `POST
 * /procurement/supplier-invoices`. Supports BOTH capture shapes the task
 * brief calls out in one form: a PO-linked invoice (supplier picker filters
 * down to that supplier's own POs, an optional per-PO-line integrity-check
 * editor appears once a PO is chosen) and an ad-hoc/non-PO invoice
 * (`dto.poId` simply omitted — no PO picker touched at all).
 *
 * **The line editor only ever appears once a PO is picked, and is itself
 * OPTIONAL even then** — `CaptureSupplierInvoiceLineDto[]` is "a data-entry
 * integrity check only ... validated against the PO then DISCARDED, never
 * persisted" (`SupplierInvoicesService.capture()`'s own doc comment, and the
 * task brief's own wording verbatim) — there's no requirement to fill it in
 * at all, `dto.lines` is simply omitted when the row list is empty. When
 * rows ARE present, their qty×unitPrice sum is shown live against `total`
 * (an honest hint, not a hard client-side block — `capture()`'s own real
 * validation, `ck` that the sum equals `total` exactly, is authoritative and
 * surfaces as a real `ApiError` on mismatch).
 *
 * **The PO picker is filtered to the chosen supplier's own POs** — a plain
 * UX convenience (`capture()` itself does NOT require `po.supplierId ===
 * dto.supplierId`, confirmed by reading it directly — no such cross-check
 * exists), not a hard rule; disabled until a supplier is chosen.
 */
export function CaptureSupplierInvoiceDialog() {
  const t = useTranslations("procurement.supplierInvoices.captureDialog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [supplierId, setSupplierId] = React.useState("");
  const [poId, setPoId] = React.useState("");
  const [supplierRef, setSupplierRef] = React.useState("");
  const [invoiceDate, setInvoiceDate] = React.useState(todayIsoDate());
  const [dueDate, setDueDate] = React.useState(todayIsoDate());
  const [total, setTotal] = React.useState("");
  const [rows, setRows] = React.useState<InvoiceLineFormRow[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const suppliersQuery = useSuppliers();
  const poQuery = usePurchaseOrders(supplierId ? { supplierId } : {});
  const poLinesQuery = usePurchaseOrderLines(poId || undefined);
  const captureMutation = useCaptureSupplierInvoice();

  const supplierItems = React.useMemo(() => (suppliersQuery.data ?? []).map((s) => ({ value: s.id, label: s.name })), [suppliersQuery.data]);
  const poLineItems = React.useMemo(
    () => (poLinesQuery.data ?? []).map((line) => ({ id: line.id, label: `${line.description} (${line.qty})` })),
    [poLinesQuery.data],
  );

  function resetForm() {
    setSupplierId("");
    setPoId("");
    setSupplierRef("");
    setInvoiceDate(todayIsoDate());
    setDueDate(todayIsoDate());
    setTotal("");
    setRows([]);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) resetForm();
  }

  function handleSupplierChange(next: string) {
    setSupplierId(next);
    setPoId("");
    setRows([]);
  }

  function handlePoChange(next: string) {
    setPoId(next);
    setRows([]);
  }

  function patchRow(key: string, patch: Partial<InvoiceLineFormRow>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  const linesSum = sumMoneyStrings(rows.map((row) => multiplyDecimalStrings(row.qty || "0", row.unitPrice || "0")));
  const rowsComplete = rows.every((row) => row.poLineId && normalizeMoneyInput(row.qty) !== null && normalizeMoneyInput(row.unitPrice) !== null);
  const canSubmit =
    !!supplierId &&
    supplierRef.trim().length > 0 &&
    !!invoiceDate &&
    !!dueDate &&
    normalizeMoneyInput(total) !== null &&
    rowsComplete &&
    !captureMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: CaptureSupplierInvoiceDto = {
      supplierId,
      ...(poId ? { poId } : {}),
      supplierRef: supplierRef.trim(),
      invoiceDate,
      dueDate,
      total: normalizeMoneyInput(total) ?? "0",
      ...(poId && rows.length > 0
        ? {
            lines: rows.map((row) => ({
              poLineId: row.poLineId,
              qty: normalizeMoneyInput(row.qty) ?? "0",
              unitPrice: normalizeMoneyInput(row.unitPrice) ?? "0",
            })),
          }
        : {}),
    };
    try {
      const captured = await captureMutation.mutateAsync(dto);
      setOpen(false);
      router.push(`/procurement/supplier-invoices/${captured.id}`);
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("supplierLabel")}</Label>
              <Combobox
                items={supplierItems}
                value={supplierId}
                onChange={handleSupplierChange}
                placeholder={suppliersQuery.isLoading ? t("loadingSuppliers") : t("selectSupplierPlaceholder")}
                searchPlaceholder={t("searchSuppliers")}
                emptyText={t("noSuppliersFound")}
                disabled={suppliersQuery.isLoading}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("poLabel")}</Label>
              <Select value={poId || "__none__"} onValueChange={(v) => handlePoChange(v === "__none__" ? "" : v)} disabled={!supplierId || poQuery.isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={!supplierId ? t("pickSupplierFirstPlaceholder") : t("selectPoPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("adHocOption")}</SelectItem>
                  {(poQuery.data ?? [])
                    .filter((po) => !isDraftPlaceholderNumber(po.number))
                    .map((po) => (
                      <SelectItem key={po.id} value={po.id}>
                        {po.number}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("poHint")}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label required>{t("supplierRefLabel")}</Label>
              <Input value={supplierRef} maxLength={SUPPLIER_REF_MAX_LENGTH} onChange={(e) => setSupplierRef(e.target.value)} placeholder={t("supplierRefPlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("invoiceDateLabel")}</Label>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("dueDateLabel")}</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label required>{t("totalLabel")}</Label>
            <MoneyInput value={total} onValueChange={(v) => setTotal(v ?? "")} />
          </div>

          {poId && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <Label>{t("linesLabel")}</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, emptyRow()])}>
                  <Plus className="size-4" />
                  {t("addLine")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("linesHint")}</p>

              {rows.length > 0 && (
                <>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("columns.poLine")}</TableHead>
                          <TableHead className="w-24">{t("columns.qty")}</TableHead>
                          <TableHead className="w-36">{t("columns.unitPrice")}</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((row) => (
                          <TableRow key={row.key}>
                            <TableCell className="min-w-[200px]">
                              <Select value={row.poLineId} onValueChange={(v) => patchRow(row.key, { poLineId: v })}>
                                <SelectTrigger>
                                  <SelectValue placeholder={t("selectPoLinePlaceholder")} />
                                </SelectTrigger>
                                <SelectContent>
                                  {poLineItems.map((item) => (
                                    <SelectItem key={item.id} value={item.id}>
                                      {item.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input inputMode="decimal" value={row.qty} onChange={(e) => patchRow(row.key, { qty: e.target.value })} />
                            </TableCell>
                            <TableCell>
                              <MoneyInput value={row.unitPrice} onValueChange={(v) => patchRow(row.key, { unitPrice: v ?? "" })} />
                            </TableCell>
                            <TableCell>
                              <Button type="button" variant="ghost" size="icon" onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))} aria-label={t("removeLine")}>
                                <Trash2 className="size-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("linesSumHint", { sum: formatMoney(linesSum), total: formatMoney(normalizeMoneyInput(total) ?? "0") })}</p>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {captureMutation.isPending ? t("capturing") : t("captureButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

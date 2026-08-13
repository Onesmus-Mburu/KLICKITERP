"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreatePaymentVoucherDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyInput } from "@/components/patterns/money-input";
import { formatMoney, normalizeMoneyInput, sumMoneyStrings } from "@/lib/money";
import { ApiError } from "@/lib/api-error";
import { useSuppliers } from "../hooks/use-suppliers";
import { useSupplierInvoices } from "../hooks/use-supplier-invoices";
import { PAYMENT_VOUCHER_METHODS, useCreatePaymentVoucher, type PaymentVoucherMethod } from "../hooks/use-payment-vouchers";

/** `PROC_SUPPLIER_INVOICE_OPEN_STATUSES` — the exact 2 statuses `PaymentVouchersService.create()`'s own BR-PROC-04 check accepts (confirmed by reading it directly), not a UI-only guess. */
const OPEN_INVOICE_STATUSES = new Set(["POSTED", "PARTIALLY_PAID"]);

interface AllocationFormRow {
  invoiceId: string;
  number: string;
  openBalance: string;
  selected: boolean;
  amount: string;
}

function negate(decimal: string): string {
  return decimal.startsWith("-") ? decimal.slice(1) : `-${decimal}`;
}

/** A BigInt-safe positive check (any nonzero digit in a non-negative decimal string) — avoids `parseFloat`/`Number()` on a money value anywhere in this app, matching `lib/money.ts`'s own established discipline. */
function isPositiveDecimal(value: string): boolean {
  const normalized = normalizeMoneyInput(value);
  if (normalized === null || normalized.startsWith("-")) return false;
  return /[1-9]/.test(normalized);
}

/** `invoice.total - invoice.paidAmount`, via `sumMoneyStrings`'s own negation trick (`lib/money.ts` has no subtract helper — the same established workaround `receive-grn-dialog.tsx`'s own `remainingQty()` already uses, Part 4). Clamped to `"0"` purely for display/defaulting; the real BR-PROC-04 ceiling is entirely server-side. */
function openBalanceOf(invoice: { total: string; paidAmount: string }): string {
  const raw = sumMoneyStrings([invoice.total, negate(invoice.paidAmount)]);
  return isPositiveDecimal(raw) ? raw : "0";
}

function amountExceedsBalance(amount: string, balance: string): boolean {
  return isPositiveDecimal(sumMoneyStrings([amount, negate(balance)]));
}

/**
 * Phase 6 Slice 18 Part 5 (Procurement, Module 12) — `POST
 * /procurement/payment-vouchers`, BR-PROC-04. Supplier picker -> that
 * supplier's own open (`POSTED`/`PARTIALLY_PAID`) supplier invoices, each row
 * a checkbox + a per-invoice allocation amount defaulting to that invoice's
 * own open balance (`total - paidAmount`) and auto-clamped back down to it
 * the moment a typed amount would exceed it — a client-side UX nicety only;
 * the real ceiling enforcement is entirely server-side
 * (`PaymentVouchersService.create()`'s own per-allocation check, re-checked
 * again at `execute()` time against the CURRENT balance — see
 * `payment-voucher-status-actions.tsx`'s own doc comment).
 *
 * **`dto.bankAccountId`/`.chequeLeafId` are omitted entirely, always** — both
 * are forward references to `bank_account`/`bank_cheque_leaf` (Module
 * 16/Banking, not built yet anywhere in this codebase, confirmed by grepping
 * for it) — no picker exists for either, per the plan's own explicit
 * instruction.
 *
 * **`voucher.total` is never a user-editable field anywhere in this
 * dialog** — it's server-derived as Σallocations
 * (`PaymentVouchersController.create()`'s own doc comment; `CreatePaymentVoucherDto`
 * has no `total` field at all). This dialog only ever shows a LIVE, computed
 * running total across the currently selected rows, for the user's own
 * information — never sent as a request field.
 *
 * **Invoices are fetched by `supplierId` alone and filtered to the 2 open
 * statuses client-side** (`useSupplierInvoices({supplierId})` has no
 * multi-status filter — `ListSupplierInvoicesFilters.status` takes exactly
 * one value — the same "fetch broad, filter narrow client-side" shape
 * `capture-supplier-invoice-dialog.tsx`'s own PO picker (Part 4) already
 * established for an analogous case), always fetched regardless of whether a
 * supplier is picked yet (`supplierId ? {supplierId} : {}`) — matching that
 * same file's own established, if slightly eager, precedent rather than
 * inventing a stricter `enabled` gate that would diverge from it.
 */
export function CreatePaymentVoucherDialog() {
  const t = useTranslations("procurement.paymentVouchers.createDialog");
  const tMethods = useTranslations("procurement.paymentVouchers.methods");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [supplierId, setSupplierId] = React.useState("");
  const [method, setMethod] = React.useState<PaymentVoucherMethod>("BANK");
  const [rows, setRows] = React.useState<AllocationFormRow[]>([]);
  const [rowsSeededFor, setRowsSeededFor] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const suppliersQuery = useSuppliers();
  const invoicesQuery = useSupplierInvoices(supplierId ? { supplierId } : {});
  const createMutation = useCreatePaymentVoucher();

  const supplierItems = React.useMemo(() => (suppliersQuery.data ?? []).map((s) => ({ value: s.id, label: s.name })), [suppliersQuery.data]);
  const openInvoices = React.useMemo(
    () => (invoicesQuery.data ?? []).filter((inv) => OPEN_INVOICE_STATUSES.has(inv.status)),
    [invoicesQuery.data],
  );

  function resetForm() {
    setSupplierId("");
    setMethod("BANK");
    setRows([]);
    setRowsSeededFor(null);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) resetForm();
  }

  function handleSupplierChange(next: string) {
    setSupplierId(next);
    setRows([]);
    setRowsSeededFor(null);
  }

  React.useEffect(() => {
    if (open && supplierId && rowsSeededFor !== supplierId && invoicesQuery.data) {
      setRows(
        openInvoices.map((inv) => {
          const balance = openBalanceOf(inv);
          return { invoiceId: inv.id, number: inv.number, openBalance: balance, selected: false, amount: balance };
        }),
      );
      setRowsSeededFor(supplierId);
    }
  }, [open, supplierId, rowsSeededFor, invoicesQuery.data, openInvoices]);

  function toggleRow(invoiceId: string, selected: boolean) {
    setRows((prev) => prev.map((row) => (row.invoiceId === invoiceId ? { ...row, selected } : row)));
  }

  function handleAmountChange(invoiceId: string, next: string | null) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.invoiceId !== invoiceId) return row;
        if (next === null) return { ...row, amount: "" };
        return { ...row, amount: amountExceedsBalance(next, row.openBalance) ? row.openBalance : next };
      }),
    );
  }

  const selectedRows = rows.filter((row) => row.selected);
  const total = sumMoneyStrings(selectedRows.map((row) => row.amount || "0"));
  const canSubmit = !!supplierId && selectedRows.length > 0 && selectedRows.every((row) => isPositiveDecimal(row.amount)) && !createMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: CreatePaymentVoucherDto = {
      supplierId,
      method,
      allocations: selectedRows.map((row) => ({ supplierInvoiceId: row.invoiceId, amount: normalizeMoneyInput(row.amount) ?? "0" })),
    };
    try {
      const created = await createMutation.mutateAsync(dto);
      setOpen(false);
      router.push(`/procurement/payment-vouchers/${created.id}`);
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
      <DialogContent className="max-w-3xl">
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
              <Label required>{t("methodLabel")}</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentVoucherMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_VOUCHER_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {tMethods(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!supplierId ? (
            <p className="text-sm text-muted-foreground">{t("pickSupplierHint")}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noOpenInvoicesHint")}</p>
          ) : (
            <div className="space-y-2">
              <Label>{t("allocationsLabel")}</Label>
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>{t("columns.invoice")}</TableHead>
                      <TableHead className="w-32">{t("columns.openBalance")}</TableHead>
                      <TableHead className="w-40">{t("columns.allocationAmount")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.invoiceId}>
                        <TableCell>
                          <Checkbox
                            checked={row.selected}
                            onChange={(e) => toggleRow(row.invoiceId, e.target.checked)}
                            aria-label={t("selectInvoice", { number: row.number })}
                          />
                        </TableCell>
                        <TableCell>{row.number}</TableCell>
                        <TableCell>{formatMoney(row.openBalance)}</TableCell>
                        <TableCell>
                          <MoneyInput value={row.amount} disabled={!row.selected} onValueChange={(v) => handleAmountChange(row.invoiceId, v)} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-sm text-foreground">{t("totalHint", { total: formatMoney(total) })}</p>
            </div>
          )}
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

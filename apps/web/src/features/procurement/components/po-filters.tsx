"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSuppliers } from "../hooks/use-suppliers";
import type { ListPurchaseOrdersFilters, PurchaseOrderStatus } from "../hooks/use-purchase-orders";

const ALL_SENTINEL = "__all__"; // `<Select>` can't represent "nothing selected" as `value=""` — same pattern `requisition-filters.tsx` (Part 2) already established.

const STATUS_VALUES: PurchaseOrderStatus[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ISSUED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "CANCELLED"];

export interface PoFiltersState {
  status: PurchaseOrderStatus | "";
  supplierId: string;
}

export const EMPTY_PO_FILTERS: PoFiltersState = { status: "", supplierId: "" };

export function poFiltersToParams(filters: PoFiltersState): ListPurchaseOrdersFilters {
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
  };
}

/**
 * Phase 6 Slice 18 Part 3 (Procurement, Module 12) — the purchase orders
 * list page's filter bar: status (`GET .../purchase-orders?status=`) and
 * supplier (`?supplierId=`), mirroring `requisition-filters.tsx`'s (Part 2)
 * own controlled `value`/`onChange` shape exactly (state lives on the page,
 * no URL/query-string sync). The supplier `<Select>` reuses
 * `useSuppliers()` with NO status filter (unlike the ACTIVE-only supplier
 * picker in the create dialogs) — an already-issued PO can reference a
 * supplier that's since been blacklisted/deactivated, and hiding it from
 * this filter would make that PO unreachable by this control.
 */
export function PoFilters({ value, onChange }: { value: PoFiltersState; onChange: (next: PoFiltersState) => void }) {
  const t = useTranslations("procurement.purchaseOrders.filters");
  const tStatuses = useTranslations("procurement.purchaseOrders.statuses");
  const suppliersQuery = useSuppliers();

  function handleStatusChange(next: string) {
    onChange({ ...value, status: next === ALL_SENTINEL ? "" : (next as PurchaseOrderStatus) });
  }

  function handleSupplierChange(next: string) {
    onChange({ ...value, supplierId: next === ALL_SENTINEL ? "" : next });
  }

  const hasActiveFilters = !!(value.status || value.supplierId);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-52 space-y-1.5">
        <Label>{t("statusLabel")}</Label>
        <Select value={value.status || ALL_SENTINEL} onValueChange={handleStatusChange}>
          <SelectTrigger>
            <SelectValue placeholder={t("allStatuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SENTINEL}>{t("allStatuses")}</SelectItem>
            {STATUS_VALUES.map((status) => (
              <SelectItem key={status} value={status}>
                {tStatuses(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="w-56 space-y-1.5">
        <Label>{t("supplierLabel")}</Label>
        <Select value={value.supplierId || ALL_SENTINEL} onValueChange={handleSupplierChange} disabled={suppliersQuery.isLoading}>
          <SelectTrigger>
            <SelectValue placeholder={t("allSuppliers")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SENTINEL}>{t("allSuppliers")}</SelectItem>
            {(suppliersQuery.data ?? []).map((supplier) => (
              <SelectItem key={supplier.id} value={supplier.id}>
                {supplier.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {hasActiveFilters && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(EMPTY_PO_FILTERS)}>
          <X className="size-4" />
          {t("clearFilters")}
        </Button>
      )}
    </div>
  );
}

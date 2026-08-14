"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { PackageMinus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { isValidDecimalString } from "@/lib/money";
import { useDepartments } from "@/features/departments/hooks/use-departments";
import { useStores } from "../hooks/use-stores";
import { useIssueStock } from "../hooks/use-stock-movements";
import { ItemCombobox, type SelectedInventoryItem } from "./item-combobox";

const NO_DEPARTMENT_VALUE = "__none__";

/**
 * Phase 6 Slice 19 Part 2 (Stock Movements + Transfers, Module 13) — the
 * manual department-consumption ISSUE form (FR-INV-003.1), the ONE real write
 * action `StockMovementsController` exposes at all (see `stock-movements.api.ts`'s
 * own doc comment for why this dialog deliberately has no "Receive" button —
 * no controller route exists for it). Item (`<ItemCombobox>`) -> store
 * (`<Select>`, active stores only, matching `create-item-dialog.tsx`'s own
 * `useSuppliers("ACTIVE")`-style active-only filter precedent) -> qty (plain
 * decimal text input, scale 4, NOT `<MoneyInput>` — a physical quantity, same
 * reasoning `create-item-dialog.tsx`'s own `reorderLevel`/`reorderQty`
 * fields already establish) -> an OPTIONAL department picker (`useDepartments()`,
 * reusing Slice 13's existing wrapper directly, no new one — per this part's
 * own explicit instruction; `departmentId` has no FK constraint server-side,
 * confirmed by reading `stock-movement.dto.ts` directly, so this list is
 * purely a convenience picker, not validated against anything).
 *
 * `refDocType`/`refDocId` are never surfaced here — both default server-side
 * when omitted (`stock-movements.api.ts`'s own doc comment).
 *
 * **BR-INV-03 freeze**: a 422 for "this item is inside an open stock-take's
 * scope at this store" is surfaced verbatim via the generic `ApiError` catch
 * block below, never genericized or swallowed — Stock Takes doesn't exist yet
 * as of this part, so this path can't be live-exercised here, but the error
 * handling doesn't special-case or hide it either.
 */
export function IssueStockDialog() {
  const t = useTranslations("inventory.stockMovements.issueDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [item, setItem] = React.useState<SelectedInventoryItem | null>(null);
  const [storeId, setStoreId] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState(NO_DEPARTMENT_VALUE);
  const [error, setError] = React.useState<string | null>(null);

  const issueMutation = useIssueStock();
  const storesQuery = useStores(true);
  const departmentsQuery = useDepartments();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setItem(null);
      setStoreId("");
      setQty("");
      setDepartmentId(NO_DEPARTMENT_VALUE);
      setError(null);
    }
  }

  const qtyValid = isValidDecimalString(qty) && !qty.trim().startsWith("-") && /[1-9]/.test(qty);
  const canSubmit = !!item && !!storeId && qtyValid && !issueMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit || !item) return;
    setError(null);
    try {
      await issueMutation.mutateAsync({
        itemId: item.id,
        storeId,
        qty: qty.trim(),
        ...(departmentId !== NO_DEPARTMENT_VALUE ? { departmentId } : {}),
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <PackageMinus className="size-4" />
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

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("itemLabel")}</Label>
            <ItemCombobox value={item?.id ?? ""} valueLabel={item ? `${item.code} — ${item.name}` : undefined} onSelect={setItem} />
          </div>

          <div className="space-y-1.5">
            <Label required>{t("storeLabel")}</Label>
            <Select value={storeId} onValueChange={setStoreId} disabled={storesQuery.isLoading}>
              <SelectTrigger>
                <SelectValue placeholder={storesQuery.isLoading ? t("loadingStores") : t("storePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {(storesQuery.data ?? []).map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label required>{t("qtyLabel")}</Label>
            <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0.0000" />
            {qty.trim().length > 0 && !qtyValid && <p className="text-xs text-destructive">{t("invalidQty")}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>{t("departmentLabel")}</Label>
            <Select value={departmentId} onValueChange={setDepartmentId} disabled={departmentsQuery.isLoading}>
              <SelectTrigger>
                <SelectValue placeholder={departmentsQuery.isLoading ? t("loadingDepartments") : t("departmentPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_DEPARTMENT_VALUE}>{t("noDepartment")}</SelectItem>
                {(departmentsQuery.data ?? []).map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {issueMutation.isPending ? t("issuing") : t("issueButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

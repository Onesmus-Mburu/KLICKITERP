"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import type { CreateVoucherDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/patterns/money-input";
import { ApiError } from "@/lib/api-error";
import { useCostCenters } from "@/features/accounting/hooks/use-cost-centers";
import { useSuppliers } from "@/features/procurement/hooks/use-suppliers";
import { useUsersLookup } from "@/features/departments/hooks/use-users-lookup";
import { useCategories } from "../hooks/use-categories";
import { useCreateVoucher, VOUCHER_METHODS, VOUCHER_PAYEE_TYPES, type VoucherMethod, type VoucherPayeeType } from "../hooks/use-vouchers";

const CONTACT_MAX_LENGTH = 120;
const OTHER_NAME_MAX_LENGTH = 120;

/**
 * Phase 6 Slice 20 Part 1 (Expenses Foundations, Module 14) — the expense
 * voucher create form: `payeeType` (a 3-way `<Select>`) drives which
 * `payeeRef` sub-form renders, per `CreateVoucherDto.payeeRef`'s genuinely
 * polymorphic shape (`voucher.dto.ts`'s own `@ApiProperty({ type: Object,
 * description: "Polymorphic payee identity, shape depends on payeeType" })`
 * — confirmed by reading `VouchersService.create()`/the entity's own doc
 * comment directly, not assumed):
 *  - `SUPPLIER` -> `{supplierId}`, a `<Combobox>` reusing
 *    `features/procurement/hooks/use-suppliers.ts` (Slice 18 Part 1) —
 *    scoped to `ACTIVE` suppliers only, the same `useSuppliers("ACTIVE")`
 *    filter `create-po-dialog.tsx`/`create-payment-voucher-dialog.tsx`
 *    already establish for a NEW document's own supplier picker.
 *  - `STAFF` -> `{staffUserId}`, a `<Combobox>` reusing
 *    `features/departments/hooks/use-users-lookup.ts` — this codebase's one
 *    existing small "no per-feature user list needed" picker wrapper
 *    (checked first, per this part's own brief, rather than building a
 *    duplicate `GET /users` wrapper here — the exact same reuse
 *    `create-store-dialog.tsx`, Inventory Slice 19 Part 1, already
 *    established for its own keeper-user picker).
 *  - `OTHER` -> `{name, contact}`, two plain text inputs — no picker exists
 *    for a payee this system has no record of at all.
 *
 * Switching `payeeType` clears every OTHER type's own local field state (the
 * same `handleItemTypeChange()` pattern `create-item-dialog.tsx` establishes
 * for its own type-conditional field set) so a half-filled OTHER
 * name/contact never silently rides along into a SUPPLIER/STAFF submission.
 *
 * `categoryId` reuses this SAME part's own `useCategories()` (Expenses'
 * categories, never Inventory's — see `categories.api.ts`'s own doc comment
 * on the opposite-direction schema collision this part's brief specifically
 * flagged), filtered client-side to `isActive` — an inactive category
 * shouldn't be assignable to a brand-new voucher, even though the list
 * endpoint itself has no `isActive` filter param. `costCenterId` is optional
 * (reuses `features/accounting/hooks/use-cost-centers.ts`, Slice 17,
 * clearable the same way `edit-category-dialog.tsx`'s own parent picker is).
 * `amount` uses `<MoneyInput>`/`lib/money.ts`'s `normalizeMoneyInput()` —
 * never `parseFloat`. `method` is a plain 5-option `<Select>`
 * (`CASH`/`BANK`/`PETTY_CASH`/`MPESA`/`CHEQUE`). `narrative` is a
 * `<Textarea>` — `exp_voucher.narrative` is a plain `text` column with no
 * DB-enforced max length (confirmed by reading `exp-voucher.entity.ts`
 * directly), so no artificial client-side cap is imposed here either.
 *
 * On success, navigates straight to the new voucher's detail page — matches
 * `create-po-dialog.tsx`'s own "land on the new document" precedent.
 */
export function CreateVoucherDialog() {
  const t = useTranslations("expenses.vouchers.createDialog");
  const tPayeeTypes = useTranslations("expenses.vouchers.payeeTypes");
  const tMethods = useTranslations("expenses.vouchers.methods");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [payeeType, setPayeeType] = React.useState<VoucherPayeeType>("SUPPLIER");
  const [supplierId, setSupplierId] = React.useState("");
  const [staffUserId, setStaffUserId] = React.useState("");
  const [otherName, setOtherName] = React.useState("");
  const [otherContact, setOtherContact] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [costCenterId, setCostCenterId] = React.useState("");
  const [amount, setAmount] = React.useState<string | null>(null);
  const [method, setMethod] = React.useState<VoucherMethod>("CASH");
  const [narrative, setNarrative] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateVoucher();
  const categoriesQuery = useCategories();
  const costCentersQuery = useCostCenters(true);
  const suppliersQuery = useSuppliers("ACTIVE", { enabled: open && payeeType === "SUPPLIER" });
  const usersQuery = useUsersLookup();

  function resetForm() {
    setPayeeType("SUPPLIER");
    setSupplierId("");
    setStaffUserId("");
    setOtherName("");
    setOtherContact("");
    setCategoryId("");
    setCostCenterId("");
    setAmount(null);
    setMethod("CASH");
    setNarrative("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) resetForm();
  }

  function handlePayeeTypeChange(next: VoucherPayeeType) {
    setPayeeType(next);
    setSupplierId("");
    setStaffUserId("");
    setOtherName("");
    setOtherContact("");
  }

  const categoryItems = React.useMemo(
    () => (categoriesQuery.data ?? []).filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name })),
    [categoriesQuery.data],
  );
  const costCenterItems = React.useMemo(
    () => (costCentersQuery.data ?? []).map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
    [costCentersQuery.data],
  );
  const supplierItems = React.useMemo(() => (suppliersQuery.data ?? []).map((s) => ({ value: s.id, label: s.name })), [suppliersQuery.data]);
  const staffItems = React.useMemo(
    () => (usersQuery.data?.items ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})` })),
    [usersQuery.data],
  );

  const payeeRefValid =
    (payeeType === "SUPPLIER" && !!supplierId) ||
    (payeeType === "STAFF" && !!staffUserId) ||
    (payeeType === "OTHER" && otherName.trim().length > 0);

  const canSubmit = payeeRefValid && !!categoryId && !!amount && !!method && narrative.trim().length > 0 && !createMutation.isPending;

  function buildPayeeRef(): Record<string, unknown> {
    if (payeeType === "SUPPLIER") return { supplierId };
    if (payeeType === "STAFF") return { staffUserId };
    return { name: otherName.trim(), contact: otherContact.trim() };
  }

  async function handleSubmit() {
    if (!canSubmit || !amount) return;
    setError(null);
    const dto: CreateVoucherDto = {
      payeeType,
      payeeRef: buildPayeeRef(),
      categoryId,
      ...(costCenterId ? { costCenterId } : {}),
      amount,
      method,
      narrative: narrative.trim(),
    };
    try {
      const created = await createMutation.mutateAsync(dto);
      setOpen(false);
      router.push(`/expenses/vouchers/${created.id}`);
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
          <div className="space-y-1.5">
            <Label required>{t("payeeTypeLabel")}</Label>
            <Select value={payeeType} onValueChange={(v) => handlePayeeTypeChange(v as VoucherPayeeType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOUCHER_PAYEE_TYPES.map((pt) => (
                  <SelectItem key={pt} value={pt}>
                    {tPayeeTypes(pt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {payeeType === "SUPPLIER" && (
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
          )}

          {payeeType === "STAFF" && (
            <div className="space-y-1.5">
              <Label required>{t("staffLabel")}</Label>
              <Combobox
                items={staffItems}
                value={staffUserId}
                onChange={setStaffUserId}
                placeholder={usersQuery.isLoading ? t("loadingUsers") : t("selectStaffPlaceholder")}
                searchPlaceholder={t("searchUsers")}
                emptyText={t("noUsersFound")}
                disabled={usersQuery.isLoading}
              />
            </div>
          )}

          {payeeType === "OTHER" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label required>{t("otherNameLabel")}</Label>
                <Input value={otherName} maxLength={OTHER_NAME_MAX_LENGTH} onChange={(e) => setOtherName(e.target.value)} placeholder={t("otherNamePlaceholder")} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("otherContactLabel")}</Label>
                <Input value={otherContact} maxLength={CONTACT_MAX_LENGTH} onChange={(e) => setOtherContact(e.target.value)} placeholder={t("otherContactPlaceholder")} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("categoryLabel")}</Label>
              <Combobox
                items={categoryItems}
                value={categoryId}
                onChange={setCategoryId}
                placeholder={categoriesQuery.isLoading ? t("loadingCategories") : t("selectCategoryPlaceholder")}
                searchPlaceholder={t("searchCategories")}
                emptyText={t("noCategoriesFound")}
                disabled={categoriesQuery.isLoading}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("costCenterLabel")}</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Combobox
                    items={costCenterItems}
                    value={costCenterId}
                    onChange={setCostCenterId}
                    placeholder={costCentersQuery.isLoading ? t("loadingCostCenters") : t("selectCostCenterPlaceholder")}
                    searchPlaceholder={t("searchCostCenters")}
                    emptyText={t("noCostCentersFound")}
                    disabled={costCentersQuery.isLoading}
                  />
                </div>
                {costCenterId && (
                  <Button type="button" variant="outline" size="icon" onClick={() => setCostCenterId("")} aria-label={t("clearCostCenter")}>
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("amountLabel")}</Label>
              <MoneyInput value={amount ?? ""} onValueChange={setAmount} />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("methodLabel")}</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as VoucherMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VOUCHER_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {tMethods(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label required>{t("narrativeLabel")}</Label>
            <Textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} placeholder={t("narrativePlaceholder")} />
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

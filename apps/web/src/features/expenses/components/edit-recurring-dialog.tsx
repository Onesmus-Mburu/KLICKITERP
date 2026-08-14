"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil, X } from "lucide-react";
import type { RecurringResponseDto, UpdateRecurringDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  parseRecurringTemplate,
  useUpdateRecurringTemplate,
  VOUCHER_METHODS,
  VOUCHER_PAYEE_TYPES,
  type VoucherMethod,
  type VoucherPayeeType,
} from "../hooks/use-recurring";
import { CronScheduleInput, isValidCronShape } from "./cron-schedule-input";

const CONTACT_MAX_LENGTH = 120;
const OTHER_NAME_MAX_LENGTH = 120;

/**
 * Phase 6 Slice 20 Part 4 (Recurring Templates, Module 14) — a plain two-way
 * diff, the same shape `edit-category-dialog.tsx` (Part 1) establishes, over
 * ALL of `UpdateRecurringDto`'s fields: `template` (every one of its 7
 * sub-fields, reusing the exact same payeeType-switching form
 * `create-recurring-dialog.tsx` establishes), `scheduleCron`
 * (`<CronScheduleInput>`), `nextRunOn` (a plain date input), and `isActive`
 * (a checkbox — this is the ONLY place in this whole part's UI a template
 * can be deactivated, which matters because `runDue()` silently skips
 * inactive templates with no separate error, see `run-due-button.tsx`'s own
 * doc comment).
 *
 * **`template` is sent as a COMPLETE object whenever ANY of its 7 sub-fields
 * changed, never a partial patch** — `recurring.api.ts`'s own doc comment
 * documents WHY: `RecurringService.update()` does a full-object overwrite of
 * the jsonb column, not a deep merge, so sending e.g. just `{narrative}`
 * would silently wipe `payeeType`/`categoryId`/`amount`/etc. server-side.
 * `parseRecurringTemplate()` (this same part's own `recurring.api.ts` export)
 * both pre-fills this form's initial state from the existing
 * `Record<string, unknown>` template AND gives this file a stable "original"
 * snapshot to diff the current form state against.
 */
export function EditRecurringDialog({ recurring }: { recurring: RecurringResponseDto }) {
  const t = useTranslations("expenses.recurring.editDialog");
  const tPayeeTypes = useTranslations("expenses.vouchers.payeeTypes");
  const tMethods = useTranslations("expenses.vouchers.methods");
  const tCommon = useTranslations("common");

  const original = React.useMemo(() => parseRecurringTemplate(recurring.template), [recurring.template]);

  const [open, setOpen] = React.useState(false);
  const [payeeType, setPayeeType] = React.useState<VoucherPayeeType>(original.payeeType);
  const [supplierId, setSupplierId] = React.useState(original.supplierId);
  const [staffUserId, setStaffUserId] = React.useState(original.staffUserId);
  const [otherName, setOtherName] = React.useState(original.otherName);
  const [otherContact, setOtherContact] = React.useState(original.otherContact);
  const [categoryId, setCategoryId] = React.useState(original.categoryId);
  const [costCenterId, setCostCenterId] = React.useState(original.costCenterId);
  const [amount, setAmount] = React.useState<string | null>(original.amount);
  const [method, setMethod] = React.useState<VoucherMethod>(original.method);
  const [narrative, setNarrative] = React.useState(original.narrative);
  const [scheduleCron, setScheduleCron] = React.useState(recurring.scheduleCron);
  const [nextRunOn, setNextRunOn] = React.useState(recurring.nextRunOn);
  const [isActive, setIsActive] = React.useState(recurring.isActive);
  const [error, setError] = React.useState<string | null>(null);

  const updateMutation = useUpdateRecurringTemplate();
  const categoriesQuery = useCategories();
  const costCentersQuery = useCostCenters(true);
  const suppliersQuery = useSuppliers("ACTIVE", { enabled: open && payeeType === "SUPPLIER" });
  const usersQuery = useUsersLookup();

  function resetForm() {
    setPayeeType(original.payeeType);
    setSupplierId(original.supplierId);
    setStaffUserId(original.staffUserId);
    setOtherName(original.otherName);
    setOtherContact(original.otherContact);
    setCategoryId(original.categoryId);
    setCostCenterId(original.costCenterId);
    setAmount(original.amount);
    setMethod(original.method);
    setNarrative(original.narrative);
    setScheduleCron(recurring.scheduleCron);
    setNextRunOn(recurring.nextRunOn);
    setIsActive(recurring.isActive);
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

  const canSubmit =
    payeeRefValid &&
    !!categoryId &&
    !!amount &&
    !!method &&
    narrative.trim().length > 0 &&
    isValidCronShape(scheduleCron) &&
    !!nextRunOn &&
    !updateMutation.isPending;

  function buildPayeeRef(): Record<string, unknown> {
    if (payeeType === "SUPPLIER") return { supplierId };
    if (payeeType === "STAFF") return { staffUserId };
    return { name: otherName.trim(), contact: otherContact.trim() };
  }

  const templateChanged =
    payeeType !== original.payeeType ||
    categoryId !== original.categoryId ||
    costCenterId !== original.costCenterId ||
    amount !== original.amount ||
    method !== original.method ||
    narrative.trim() !== original.narrative ||
    (payeeType === "SUPPLIER" && supplierId !== original.supplierId) ||
    (payeeType === "STAFF" && staffUserId !== original.staffUserId) ||
    (payeeType === "OTHER" && (otherName.trim() !== original.otherName || otherContact.trim() !== original.otherContact));

  async function handleSubmit() {
    if (!canSubmit || !amount) return;
    setError(null);
    const dto: UpdateRecurringDto = {};
    if (templateChanged) {
      dto.template = {
        payeeType,
        payeeRef: buildPayeeRef(),
        categoryId,
        ...(costCenterId ? { costCenterId } : {}),
        amount,
        method,
        narrative: narrative.trim(),
      };
    }
    if (scheduleCron !== recurring.scheduleCron) dto.scheduleCron = scheduleCron;
    if (nextRunOn !== recurring.nextRunOn) dto.nextRunOn = nextRunOn;
    if (isActive !== recurring.isActive) dto.isActive = isActive;

    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: recurring.id, dto });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Pencil className="size-4" />
          {tCommon("edit")}
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

          <div className="space-y-1.5">
            <Label required>{t("scheduleLabel")}</Label>
            <CronScheduleInput value={scheduleCron} onChange={setScheduleCron} />
          </div>

          <div className="space-y-1.5">
            <Label required>{t("nextRunOnLabel")}</Label>
            <Input type="date" value={nextRunOn} onChange={(e) => setNextRunOn(e.target.value)} />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox id="edit-exp-recurring-is-active" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <div>
              <Label htmlFor="edit-exp-recurring-is-active">{t("isActiveLabel")}</Label>
              <p className="text-xs text-muted-foreground">{t("isActiveHint")}</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {updateMutation.isPending ? t("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

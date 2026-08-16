"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import type { FaAssetResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/patterns/money-input";
import { ApiError } from "@/lib/api-error";
import type { UpdateAssetInput } from "../api/assets.api";
import { useUpdateAsset } from "../hooks/use-assets";
import { useUsersLookup } from "../hooks/use-users-lookup";
import { CategoryCombobox } from "./category-combobox";

const NAME_MAX_LENGTH = 120;
const SERIAL_NO_MAX_LENGTH = 60;
const BARCODE_MAX_LENGTH = 60;
const LOCATION_MAX_LENGTH = 120;
const CONDITION_MAX_LENGTH = 20;

function insuranceNotesOf(insurance: Record<string, unknown> | null): string {
  if (!insurance) return "";
  const notes = (insurance as { notes?: unknown }).notes;
  return typeof notes === "string" ? notes : "";
}

/**
 * Phase 6 Slice 23 Part 1 (Fixed Assets foundations, Module 17) — the asset
 * register edit form. **`code`/`acquisitionDate`/`cost`/`fundingSource`/
 * `supplierId`/`poId`/`grnId`/`inServiceFrom` are OMITTED entirely** —
 * confirmed by reading `UpdateFaAssetDto` directly, none of the 8 are
 * accepted here, matching this codebase's standard "immutable fields get
 * omitted from edit, not disabled" precedent (the opposite of Categories,
 * which is genuinely fully editable — see `edit-category-dialog.tsx`'s own
 * doc comment).
 *
 * `insurance`'s free-text `<Textarea>` round-trips through the same
 * `{ notes: text }` shape `create-asset-dialog.tsx` writes — if the asset's
 * real `insurance` value doesn't have that exact shape (e.g. edited via a
 * future screen or raw API call with a different jsonb shape), this dialog
 * shows it blank rather than guessing, and saving overwrites it with the
 * `{ notes }` shape once the user actually edits this field.
 */
export function EditAssetDialog({ asset }: { asset: FaAssetResponseDto }) {
  const t = useTranslations("fixedAssets.assets.editDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(asset.name);
  const [categoryId, setCategoryId] = React.useState(asset.categoryId);
  const [serialNo, setSerialNo] = React.useState(asset.serialNo ?? "");
  const [barcode, setBarcode] = React.useState(asset.barcode ?? "");
  const [location, setLocation] = React.useState(asset.location);
  const [custodianUserId, setCustodianUserId] = React.useState(asset.custodianUserId ?? "");
  const [lifeMonthsOverride, setLifeMonthsOverride] = React.useState(asset.lifeMonthsOverride != null ? String(asset.lifeMonthsOverride) : "");
  const [residualValue, setResidualValue] = React.useState(asset.residualValue);
  const [insuranceNotes, setInsuranceNotes] = React.useState(insuranceNotesOf(asset.insurance));
  const [condition, setCondition] = React.useState(asset.condition);
  const [error, setError] = React.useState<string | null>(null);

  const updateMutation = useUpdateAsset();
  const usersQuery = useUsersLookup();

  function resetToAsset() {
    setName(asset.name);
    setCategoryId(asset.categoryId);
    setSerialNo(asset.serialNo ?? "");
    setBarcode(asset.barcode ?? "");
    setLocation(asset.location);
    setCustodianUserId(asset.custodianUserId ?? "");
    setLifeMonthsOverride(asset.lifeMonthsOverride != null ? String(asset.lifeMonthsOverride) : "");
    setResidualValue(asset.residualValue);
    setInsuranceNotes(insuranceNotesOf(asset.insurance));
    setCondition(asset.condition);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) resetToAsset();
  }

  const userItems = React.useMemo(
    () => (usersQuery.data?.items ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})` })),
    [usersQuery.data],
  );

  const canSubmit = name.trim().length > 0 && !!categoryId && location.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: UpdateAssetInput = {};
    if (name.trim() !== asset.name) dto.name = name.trim();
    if (categoryId !== asset.categoryId) dto.categoryId = categoryId;
    const originalSerialNo = asset.serialNo ?? "";
    if (serialNo.trim() !== originalSerialNo) dto.serialNo = serialNo.trim() === "" ? null : serialNo.trim();
    const originalBarcode = asset.barcode ?? "";
    if (barcode.trim() !== originalBarcode) dto.barcode = barcode.trim() === "" ? null : barcode.trim();
    if (location.trim() !== asset.location) dto.location = location.trim();
    const originalCustodian = asset.custodianUserId ?? "";
    if (custodianUserId !== originalCustodian) dto.custodianUserId = custodianUserId === "" ? null : custodianUserId;
    const originalLifeOverride = asset.lifeMonthsOverride != null ? String(asset.lifeMonthsOverride) : "";
    if (lifeMonthsOverride.trim() !== originalLifeOverride) {
      dto.lifeMonthsOverride = lifeMonthsOverride.trim() === "" ? null : Number(lifeMonthsOverride.trim());
    }
    if (residualValue.trim() !== asset.residualValue) dto.residualValue = residualValue.trim();
    const originalInsuranceNotes = insuranceNotesOf(asset.insurance);
    if (insuranceNotes.trim() !== originalInsuranceNotes) {
      dto.insurance = insuranceNotes.trim() === "" ? null : { notes: insuranceNotes.trim() };
    }
    if (condition.trim() !== asset.condition && condition.trim().length > 0) dto.condition = condition.trim();

    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: asset.id, dto });
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title", { code: asset.code })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("nameLabel")}</Label>
            <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label required>{t("categoryLabel")}</Label>
            <CategoryCombobox
              value={categoryId}
              onChange={setCategoryId}
              placeholder={t("categoryPlaceholder")}
              loadingText={t("loadingCategories")}
              searchPlaceholder={t("categorySearchPlaceholder")}
              emptyText={t("categoryEmptyText")}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("serialNoLabel")}</Label>
              <Input value={serialNo} maxLength={SERIAL_NO_MAX_LENGTH} onChange={(e) => setSerialNo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("barcodeLabel")}</Label>
              <Input value={barcode} maxLength={BARCODE_MAX_LENGTH} onChange={(e) => setBarcode(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label required>{t("locationLabel")}</Label>
            <Input value={location} maxLength={LOCATION_MAX_LENGTH} onChange={(e) => setLocation(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("custodianLabel")}</Label>
            <Combobox
              items={userItems}
              value={custodianUserId}
              onChange={setCustodianUserId}
              placeholder={usersQuery.isLoading ? t("loadingUsers") : t("custodianPlaceholder")}
              searchPlaceholder={t("custodianSearchPlaceholder")}
              emptyText={t("custodianEmptyText")}
              disabled={usersQuery.isLoading}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("lifeMonthsOverrideLabel")}</Label>
              <Input type="number" min={1} step={1} value={lifeMonthsOverride} onChange={(e) => setLifeMonthsOverride(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("residualValueLabel")}</Label>
              <MoneyInput value={residualValue} onValueChange={(v) => setResidualValue(v ?? "")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("conditionLabel")}</Label>
            <Input value={condition} maxLength={CONDITION_MAX_LENGTH} onChange={(e) => setCondition(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("conditionEditHint")}</p>
          </div>

          <div className="space-y-1.5">
            <Label>{t("insuranceLabel")}</Label>
            <Textarea value={insuranceNotes} onChange={(e) => setInsuranceNotes(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || updateMutation.isPending}>
            {updateMutation.isPending ? t("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

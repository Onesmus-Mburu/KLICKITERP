"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreateFaAssetDto } from "@klickit/contracts";
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
import { useCreateAsset } from "../hooks/use-assets";
import { useUsersLookup } from "../hooks/use-users-lookup";
import { CategoryCombobox } from "./category-combobox";

const CODE_MAX_LENGTH = 30; // fa_asset.code is varchar(30) — fa-asset.entity.ts.
const NAME_MAX_LENGTH = 120;
const SERIAL_NO_MAX_LENGTH = 60;
const BARCODE_MAX_LENGTH = 60;
const LOCATION_MAX_LENGTH = 120;
const CONDITION_MAX_LENGTH = 20;
const FA_ASSET_FUNDING_SOURCES = ["SCHOOL", "GRANT", "DONOR"] as const;

/**
 * Phase 6 Slice 23 Part 1 (Fixed Assets foundations, Module 17) — the asset
 * register create form. `code`/`acquisitionDate`/`cost`/`fundingSource`/
 * `supplierId`/`poId`/`grnId`/`inServiceFrom` are all create-only/immutable
 * (confirmed by reading `UpdateFaAssetDto` directly — none of the 8 appear
 * there) — this dialog is the ONLY place any of them are ever set.
 *
 * **`categoryId`**: `<CategoryCombobox>`, this same part's own reusable
 * picker.
 *
 * **`custodianUserId`** (optional): a small self-contained users lookup
 * (`useUsersLookup()`, mirroring `features/payroll/api/users-lookup.api.ts`'s
 * own pattern) — no reusable cross-feature user-combobox exists in this
 * codebase (each feature folder stays self-contained, confirmed by grep), so
 * this file carries its own small copy.
 *
 * **`supplierId`/`poId`/`grnId`** (all optional, all immutable): plain
 * text-uuid inputs, a deliberate judgment call — no reusable supplier/PO/GRN
 * `<Combobox>` exists anywhere in `features/procurement/`/`features/inventory/`
 * yet (only hooks/api wrappers do, confirmed by grep before writing this),
 * and building 3 new cross-feature comboboxes is out of this part's own
 * scope. A plain optional UUID text input is an acceptable fallback per this
 * part's own task brief — a future pass can replace these with real pickers
 * once procurement/inventory build their own reusable comboboxes.
 *
 * **`residualValue`** (optional): left blank, `AssetsService.create()`
 * derives it as `cost × category.residual_pct` server-side — this dialog
 * never computes that figure itself, only shows the derivation as helper
 * copy (`residualValueHint`).
 *
 * **`insurance`** (optional opaque jsonb, no fixed schema): a plain free-text
 * `<Textarea>` — the typed text is wrapped as `{ notes: text }` on submit
 * (a judgment call: `insurance` has no schema anywhere in this codebase to
 * match, so a single free-text `notes` key is the simplest honest shape).
 *
 * **`photos`** is deliberately OMITTED from this form entirely — no
 * file-upload-then-reference pattern exists cheaply enough to build this
 * part (`photos` is a loose `uuid[]` of pre-uploaded `file_object` ids, per
 * `asset.dto.ts`'s own doc comment) — deferred, not silently dropped; see
 * this slice's own write-up.
 *
 * `uq_fa_asset_code`/`uq_fa_asset_barcode`'s 409 (this part's own
 * opportunistic backend fix) is never pre-validated client-side — a real
 * `409` is surfaced verbatim via `ApiError.message`.
 */
export function CreateAssetDialog() {
  const t = useTranslations("fixedAssets.assets.createDialog");
  const tFundingSources = useTranslations("fixedAssets.fundingSources");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [serialNo, setSerialNo] = React.useState("");
  const [barcode, setBarcode] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [custodianUserId, setCustodianUserId] = React.useState("");
  const [acquisitionDate, setAcquisitionDate] = React.useState("");
  const [cost, setCost] = React.useState("");
  const [fundingSource, setFundingSource] = React.useState<(typeof FA_ASSET_FUNDING_SOURCES)[number]>("SCHOOL");
  const [supplierId, setSupplierId] = React.useState("");
  const [poId, setPoId] = React.useState("");
  const [grnId, setGrnId] = React.useState("");
  const [inServiceFrom, setInServiceFrom] = React.useState("");
  const [lifeMonthsOverride, setLifeMonthsOverride] = React.useState("");
  const [residualValue, setResidualValue] = React.useState("");
  const [insuranceNotes, setInsuranceNotes] = React.useState("");
  const [condition, setCondition] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateAsset();
  const usersQuery = useUsersLookup();

  function resetForm() {
    setCode("");
    setName("");
    setCategoryId("");
    setSerialNo("");
    setBarcode("");
    setLocation("");
    setCustodianUserId("");
    setAcquisitionDate("");
    setCost("");
    setFundingSource("SCHOOL");
    setSupplierId("");
    setPoId("");
    setGrnId("");
    setInServiceFrom("");
    setLifeMonthsOverride("");
    setResidualValue("");
    setInsuranceNotes("");
    setCondition("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) resetForm();
  }

  const userItems = React.useMemo(
    () => (usersQuery.data?.items ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})` })),
    [usersQuery.data],
  );

  const canSubmit =
    code.trim().length > 0 &&
    name.trim().length > 0 &&
    !!categoryId &&
    location.trim().length > 0 &&
    !!acquisitionDate &&
    cost.trim().length > 0 &&
    Number(cost) > 0 &&
    !!inServiceFrom;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: CreateFaAssetDto = {
      code: code.trim(),
      name: name.trim(),
      categoryId,
      ...(serialNo.trim() ? { serialNo: serialNo.trim() } : {}),
      ...(barcode.trim() ? { barcode: barcode.trim() } : {}),
      location: location.trim(),
      ...(custodianUserId ? { custodianUserId } : {}),
      acquisitionDate,
      cost: cost.trim(),
      fundingSource,
      ...(supplierId.trim() ? { supplierId: supplierId.trim() } : {}),
      ...(poId.trim() ? { poId: poId.trim() } : {}),
      ...(grnId.trim() ? { grnId: grnId.trim() } : {}),
      inServiceFrom,
      ...(lifeMonthsOverride.trim() ? { lifeMonthsOverride: Number(lifeMonthsOverride) } : {}),
      ...(residualValue.trim() ? { residualValue: residualValue.trim() } : {}),
      ...(insuranceNotes.trim() ? { insurance: { notes: insuranceNotes.trim() } } : {}),
      ...(condition.trim() ? { condition: condition.trim() } : {}),
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("codeLabel")}</Label>
              <Input value={code} maxLength={CODE_MAX_LENGTH} onChange={(e) => setCode(e.target.value)} placeholder={t("codePlaceholder")} />
              <p className="text-xs text-muted-foreground">{t("codeHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label required>{t("nameLabel")}</Label>
              <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
            </div>
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
              <p className="text-xs text-muted-foreground">{t("barcodeHint")}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label required>{t("locationLabel")}</Label>
            <Input value={location} maxLength={LOCATION_MAX_LENGTH} onChange={(e) => setLocation(e.target.value)} placeholder={t("locationPlaceholder")} />
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
              <Label required>{t("acquisitionDateLabel")}</Label>
              <Input type="date" value={acquisitionDate} onChange={(e) => setAcquisitionDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("costLabel")}</Label>
              <MoneyInput value={cost} onValueChange={(v) => setCost(v ?? "")} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("fundingSourceLabel")}</Label>
              <Select value={fundingSource} onValueChange={(v) => setFundingSource(v as (typeof FA_ASSET_FUNDING_SOURCES)[number])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FA_ASSET_FUNDING_SOURCES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {tFundingSources(f)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label required>{t("inServiceFromLabel")}</Label>
              <Input type="date" value={inServiceFrom} onChange={(e) => setInServiceFrom(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t("supplierIdLabel")}</Label>
              <Input value={supplierId} onChange={(e) => setSupplierId(e.target.value)} placeholder={t("uuidPlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("poIdLabel")}</Label>
              <Input value={poId} onChange={(e) => setPoId(e.target.value)} placeholder={t("uuidPlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("grnIdLabel")}</Label>
              <Input value={grnId} onChange={(e) => setGrnId(e.target.value)} placeholder={t("uuidPlaceholder")} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("procurementLinkHint")}</p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("lifeMonthsOverrideLabel")}</Label>
              <Input type="number" min={1} step={1} value={lifeMonthsOverride} onChange={(e) => setLifeMonthsOverride(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t("lifeMonthsOverrideHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("residualValueLabel")}</Label>
              <MoneyInput value={residualValue} onValueChange={(v) => setResidualValue(v ?? "")} />
              <p className="text-xs text-muted-foreground">{t("residualValueHint")}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("conditionLabel")}</Label>
            <Input value={condition} maxLength={CONDITION_MAX_LENGTH} onChange={(e) => setCondition(e.target.value)} placeholder={t("conditionPlaceholder")} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("insuranceLabel")}</Label>
            <Textarea value={insuranceNotes} onChange={(e) => setInsuranceNotes(e.target.value)} placeholder={t("insurancePlaceholder")} rows={3} />
            <p className="text-xs text-muted-foreground">{t("insuranceHint")}</p>
          </div>

          <p className="text-xs text-muted-foreground">{t("photosDeferredHint")}</p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? t("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

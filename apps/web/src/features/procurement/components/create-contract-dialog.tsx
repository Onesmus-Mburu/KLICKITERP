"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreateContractDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/patterns/money-input";
import { normalizeMoneyInput } from "@/lib/money";
import { ApiError } from "@/lib/api-error";
import { useSuppliers } from "../hooks/use-suppliers";
import { useCreateContract } from "../hooks/use-contracts";

const TITLE_MAX_LENGTH = 160; // CreateContractDto.title's own @ApiProperty({maxLength: 160}) — contract.dto.ts.
const DEFAULT_RENEWAL_ALERT_DAYS = 30; // ContractsService's own DEFAULT_RENEWAL_ALERT_DAYS — shown only as a placeholder hint, see doc comment below.

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Phase 6 Slice 18 Part 5 (Procurement, Module 12) — `POST
 * /procurement/contracts`, creates `status='ACTIVE'` directly. No DRAFT/
 * approval workflow exists for this entity at all (confirmed by reading
 * `ContractsController`/`ContractsService` directly) — this dialog is
 * structurally closer to `create-supplier-dialog.tsx` (Part 1) than any
 * approval-gated create dialog in this feature folder.
 *
 * **`renewalAlertDays` is left EMPTY by default, not pre-filled with
 * `30`** — leaving the input empty omits `renewalAlertDays` from the request
 * body entirely (`normalizeMoneyInput`-style "empty means omit, not zero"
 * discipline applied to an integer field), letting `ContractsService.create()`'s`
 * own real server-side default (`DEFAULT_RENEWAL_ALERT_DAYS`) apply. `30`
 * only ever appears as the input's `placeholder` (grey hint text), never a
 * value the user didn't actually choose.
 *
 * **`documentFileId` has no UI at all** — no file picker exists anywhere in
 * this codebase yet, per the plan's own explicit scope ("skip, no file
 * picker").
 */
export function CreateContractDialog() {
  const t = useTranslations("procurement.contracts.createDialog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [supplierId, setSupplierId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [startsOn, setStartsOn] = React.useState(todayIsoDate());
  const [endsOn, setEndsOn] = React.useState(todayIsoDate());
  const [value, setValue] = React.useState("");
  const [renewalAlertDays, setRenewalAlertDays] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const suppliersQuery = useSuppliers();
  const createMutation = useCreateContract();

  const supplierItems = React.useMemo(() => (suppliersQuery.data ?? []).map((s) => ({ value: s.id, label: s.name })), [suppliersQuery.data]);

  function resetForm() {
    setSupplierId("");
    setTitle("");
    setStartsOn(todayIsoDate());
    setEndsOn(todayIsoDate());
    setValue("");
    setRenewalAlertDays("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) resetForm();
  }

  const parsedRenewalAlertDays = renewalAlertDays.trim() === "" ? undefined : Number(renewalAlertDays);
  const renewalAlertDaysValid = parsedRenewalAlertDays === undefined || (Number.isInteger(parsedRenewalAlertDays) && parsedRenewalAlertDays >= 0);
  const datesValid = !!startsOn && !!endsOn && endsOn >= startsOn;
  const canSubmit = !!supplierId && title.trim().length > 0 && datesValid && renewalAlertDaysValid && !createMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const normalizedValue = normalizeMoneyInput(value);
    const dto: CreateContractDto = {
      supplierId,
      title: title.trim(),
      startsOn,
      endsOn,
      ...(normalizedValue !== null ? { value: normalizedValue } : {}),
      ...(parsedRenewalAlertDays !== undefined ? { renewalAlertDays: parsedRenewalAlertDays } : {}),
    };
    try {
      const created = await createMutation.mutateAsync(dto);
      setOpen(false);
      router.push(`/procurement/contracts/${created.id}`);
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
      <DialogContent className="max-w-xl">
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
            <Label required>{t("titleLabel")}</Label>
            <Input value={title} maxLength={TITLE_MAX_LENGTH} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePlaceholder")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label required>{t("startsOnLabel")}</Label>
              <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("endsOnLabel")}</Label>
              <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
          </div>
          {!datesValid && startsOn && endsOn && <p className="text-xs text-destructive">{t("datesInvalidHint")}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("valueLabel")}</Label>
              <MoneyInput value={value} onValueChange={(v) => setValue(v ?? "")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("renewalAlertDaysLabel")}</Label>
              <Input
                type="number"
                min={0}
                value={renewalAlertDays}
                onChange={(e) => setRenewalAlertDays(e.target.value)}
                placeholder={String(DEFAULT_RENEWAL_ALERT_DAYS)}
              />
              <p className="text-xs text-muted-foreground">{t("renewalAlertDaysHint")}</p>
            </div>
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

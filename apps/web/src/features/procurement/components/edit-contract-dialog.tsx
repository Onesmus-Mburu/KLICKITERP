"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import type { ContractResponseDto, UpdateContractDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/patterns/money-input";
import { normalizeMoneyInput } from "@/lib/money";
import { ApiError } from "@/lib/api-error";
import { useUpdateContract } from "../hooks/use-contracts";

const TITLE_MAX_LENGTH = 160; // UpdateContractDto.title's own @ApiPropertyOptional({maxLength: 160}) — contract.dto.ts.

/**
 * Phase 6 Slice 18 Part 5 — a plain two-way diff (only fields that actually
 * changed are sent), matching `edit-supplier-dialog.tsx`'s (Part 1) own
 * established shape.
 *
 * **A real, documented gap, not an oversight**: `value` is NOT
 * null-clearable from this dialog — blanking the input back to empty simply
 * omits `value` from the PATCH body (leaving the server-side value
 * unchanged), it does not send `null`. This mirrors
 * `edit-supplier-dialog.tsx`'s own documented `tradingName`/`kraPin` gap,
 * though for a different reason here: `normalizeMoneyInput("")` returns
 * `null`, and this dialog's own diff logic deliberately treats "typed value
 * normalizes to `null`" as "no real edit was made" rather than "clear the
 * field" — building the real 3-way (unchanged / set-to-X / explicitly-null)
 * diff this field's own `string | null` type could support was judged not
 * worth it for this pass, the same cost/benefit call `edit-supplier-dialog.tsx`
 * already made.
 *
 * **`supplierId`/`documentFileId` aren't editable from this dialog** —
 * `UpdateContractDto` has no `supplierId` field at all (confirmed by reading
 * `contract.dto.ts` directly — a contract's supplier can't change after
 * creation), and no file picker exists anywhere in this codebase yet for
 * `documentFileId`, per the plan's own scope.
 */
export function EditContractDialog({ contract }: { contract: ContractResponseDto }) {
  const t = useTranslations("procurement.contracts.editDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState(contract.title);
  const [startsOn, setStartsOn] = React.useState(contract.startsOn);
  const [endsOn, setEndsOn] = React.useState(contract.endsOn);
  const [value, setValue] = React.useState(contract.value ?? "");
  const [renewalAlertDays, setRenewalAlertDays] = React.useState(String(contract.renewalAlertDays));
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateContract();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setTitle(contract.title);
      setStartsOn(contract.startsOn);
      setEndsOn(contract.endsOn);
      setValue(contract.value ?? "");
      setRenewalAlertDays(String(contract.renewalAlertDays));
      setError(null);
    }
  }

  const parsedRenewalAlertDays = Number(renewalAlertDays);
  const renewalAlertDaysValid = Number.isInteger(parsedRenewalAlertDays) && parsedRenewalAlertDays >= 0;
  const datesValid = !!startsOn && !!endsOn && endsOn >= startsOn;
  const canSubmit = title.trim().length > 0 && datesValid && renewalAlertDaysValid;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);

    const dto: UpdateContractDto = {};
    if (title.trim() !== contract.title) dto.title = title.trim();
    if (startsOn !== contract.startsOn) dto.startsOn = startsOn;
    if (endsOn !== contract.endsOn) dto.endsOn = endsOn;

    const normalizedValue = normalizeMoneyInput(value);
    if (normalizedValue !== null && normalizedValue !== (contract.value ?? "")) dto.value = normalizedValue;

    if (parsedRenewalAlertDays !== contract.renewalAlertDays) dto.renewalAlertDays = parsedRenewalAlertDays;

    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: contract.id, dto });
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { title: contract.title })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("titleLabel")}</Label>
            <Input value={title} maxLength={TITLE_MAX_LENGTH} onChange={(e) => setTitle(e.target.value)} />
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
          {!datesValid && <p className="text-xs text-destructive">{t("datesInvalidHint")}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("valueLabel")}</Label>
              <MoneyInput value={value} onValueChange={(v) => setValue(v ?? "")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("renewalAlertDaysLabel")}</Label>
              <Input type="number" min={0} value={renewalAlertDays} onChange={(e) => setRenewalAlertDays(e.target.value)} />
            </div>
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

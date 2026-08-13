"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import type { AccountResponseDto, UpdateAccountDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { useUpdateAccount } from "../hooks/use-accounts";

const NAME_MAX_LENGTH = 120; // gl_account.name is varchar(120) — update-account.dto.ts.
const TAX_TREATMENT_MAX_LENGTH = 20; // gl_account.tax_treatment is varchar(20) — update-account.dto.ts.
const NONE_SENTINEL = "__none__";

const CONTROL_DOMAINS = [
  "AR_STUDENT",
  "AR_SPONSOR",
  "AP_SUPPLIER",
  "WALLET",
  "INVENTORY",
  "PAYROLL",
  "PREPAYMENT",
  "MPESA_CLEARING",
  "TRANSFER_CLEARING",
] as const;

/**
 * Phase 6 Slice 17 Part 1 (Accounting Core foundations, Module 7) —
 * `UpdateAccountDto` only allows `name?`/`isControl?`/`controlDomain?`/
 * `taxTreatment?` (`AccountsController.update()`'s own doc comment: "code/
 * class/parentId/isPostable are locked post-creation"). This dialog
 * deliberately OMITS those 4 fields entirely — not disabled inputs, no
 * fields rendered at all — matching the plan's explicit instruction.
 *
 * `controlDomain` needs a three-way diff, same reasoning
 * `EditDepartmentDialog`'s own doc comment documents for `headUserId`:
 * omitting the field means "leave unchanged," sending `null` means "clear
 * it," sending a value means "set it." Local state uses `""` as the
 * `<Select>`'s own "nothing selected" sentinel (`NONE_SENTINEL` maps to it
 * — Radix's `<Select.Item>` can't itself carry an empty-string `value`).
 */
export function EditAccountDialog({ account }: { account: AccountResponseDto }) {
  const t = useTranslations("accounting.accounts.editDialog");
  const tControlDomains = useTranslations("accounting.controlDomains");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(account.name);
  const [isControl, setIsControl] = React.useState(account.isControl);
  const [controlDomain, setControlDomain] = React.useState(account.controlDomain ?? "");
  const [taxTreatment, setTaxTreatment] = React.useState(account.taxTreatment ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateAccount();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName(account.name);
      setIsControl(account.isControl);
      setControlDomain(account.controlDomain ?? "");
      setTaxTreatment(account.taxTreatment ?? "");
      setError(null);
    }
  }

  function handleIsControlChange(next: boolean) {
    setIsControl(next);
    if (!next) setControlDomain("");
  }

  const canSubmit = name.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: UpdateAccountDto = {};
    if (name.trim() !== account.name) dto.name = name.trim();
    if (isControl !== account.isControl) dto.isControl = isControl;

    const originalControlDomain = account.controlDomain ?? "";
    if (controlDomain !== originalControlDomain) {
      dto.controlDomain = controlDomain === "" ? null : (controlDomain as UpdateAccountDto["controlDomain"]);
    }

    const originalTaxTreatment = account.taxTreatment ?? "";
    if (taxTreatment.trim() !== originalTaxTreatment) {
      dto.taxTreatment = taxTreatment.trim() === "" ? null : taxTreatment.trim();
    }

    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: account.id, dto });
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
          <DialogTitle>{t("title", { name: account.name })}</DialogTitle>
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

          <div className="flex items-start gap-2">
            <Checkbox id="edit-account-is-control" checked={isControl} onChange={(e) => handleIsControlChange(e.target.checked)} />
            <Label htmlFor="edit-account-is-control">{t("isControlLabel")}</Label>
          </div>

          {isControl && (
            <div className="space-y-1.5">
              <Label>{t("controlDomainLabel")}</Label>
              <Select value={controlDomain || NONE_SENTINEL} onValueChange={(v) => setControlDomain(v === NONE_SENTINEL ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectControlDomain")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SENTINEL}>{t("noneOption")}</SelectItem>
                  {CONTROL_DOMAINS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {tControlDomains(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t("taxTreatmentLabel")}</Label>
            <Input
              value={taxTreatment}
              maxLength={TAX_TREATMENT_MAX_LENGTH}
              onChange={(e) => setTaxTreatment(e.target.value)}
              placeholder={t("taxTreatmentPlaceholder")}
            />
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

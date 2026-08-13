"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreateAccountDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { useAccounts, useCreateAccount } from "../hooks/use-accounts";

const CODE_MAX_LENGTH = 20; // gl_account.code is varchar(20) — create-account.dto.ts.
const NAME_MAX_LENGTH = 120; // gl_account.name is varchar(120) — create-account.dto.ts.
const TAX_TREATMENT_MAX_LENGTH = 20; // gl_account.tax_treatment is varchar(20) — create-account.dto.ts.

const ACCOUNT_CLASSES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;
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

const NONE_SENTINEL = "__none__"; // `<Select>` (unlike `<Combobox>`) can't represent "nothing selected" as `value=""` on an `<Item>` — Radix reserves that. Used only for the optional `controlDomain` select's explicit "None" row below.

/**
 * Phase 6 Slice 17 Part 1 (Accounting Core foundations, Module 7) — the
 * Chart of Accounts create form. `code`/`class`/`parentId`/`isPostable` are
 * all locked post-creation server-side (`AccountsController.update()`'s own
 * doc comment: "to reclassify, deactivate + recreate") — this is the ONLY
 * place any of them can ever be set, unlike `EditAccountDialog` which omits
 * all four entirely.
 *
 * **`isPostable` client-side guard (per the plan's own explicit
 * instruction)**: `CreateAccountDto.parentId` is required whenever
 * `isPostable=true` (a root/no-parent account can never be postable —
 * confirmed directly against `create-account.dto.ts`'s own
 * `@ApiPropertyOptional({ description: "Required when isPostable=true
 * (roots are headers)" })`). The `isPostable` checkbox is disabled (and
 * forced back to `false`) whenever no parent is selected, so the illegal
 * combination can never even be attempted, not just server-rejected.
 *
 * **Parent picker**: `GET /accounting/accounts` has no `isPostable` filter
 * param (confirmed by reading `AccountsController.list()` directly) — per
 * the plan, this fetches the full flat list via `useAccounts()` (no
 * filters) and lets the admin pick any account as a parent from a
 * `<Combobox>` showing `code — name`, trusting the user rather than
 * pretending to filter to "only header accounts" the API can't actually
 * express.
 *
 * **`controlDomain` shown only when `isControl` is checked** — a judgment
 * call, not explicitly required by the plan: `controlDomain` is only
 * conceptually meaningful for a control account (e.g. the one GL account
 * `WALLET`/`AR_STUDENT` postings clear through), so hiding it otherwise
 * keeps the form's default (non-control) path shorter without losing any
 * real capability — unchecking `isControl` also clears any already-chosen
 * `controlDomain` rather than silently submitting a stale hidden value.
 */
export function CreateAccountDialog() {
  const t = useTranslations("accounting.accounts.createDialog");
  const tClasses = useTranslations("accounting.classes");
  const tControlDomains = useTranslations("accounting.controlDomains");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [accountClass, setAccountClass] = React.useState<(typeof ACCOUNT_CLASSES)[number]>("ASSET");
  const [parentId, setParentId] = React.useState("");
  const [isPostable, setIsPostable] = React.useState(false);
  const [isControl, setIsControl] = React.useState(false);
  const [controlDomain, setControlDomain] = React.useState("");
  const [taxTreatment, setTaxTreatment] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const createMutation = useCreateAccount();
  const accountsQuery = useAccounts();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setCode("");
      setName("");
      setAccountClass("ASSET");
      setParentId("");
      setIsPostable(false);
      setIsControl(false);
      setControlDomain("");
      setTaxTreatment("");
      setError(null);
    }
  }

  function handleParentChange(next: string) {
    setParentId(next);
    if (!next) setIsPostable(false);
  }

  function handleIsControlChange(next: boolean) {
    setIsControl(next);
    if (!next) setControlDomain("");
  }

  const parentPickerItems = (accountsQuery.data ?? []).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }));
  const canSubmit = code.trim().length > 0 && name.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: CreateAccountDto = {
      code: code.trim(),
      name: name.trim(),
      class: accountClass,
      isPostable: isPostable && !!parentId,
      ...(parentId ? { parentId } : {}),
      ...(isControl ? { isControl: true } : {}),
      ...(isControl && controlDomain ? { controlDomain: controlDomain as CreateAccountDto["controlDomain"] } : {}),
      ...(taxTreatment.trim() ? { taxTreatment: taxTreatment.trim() } : {}),
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
      <DialogContent className="max-h-[85vh] overflow-y-auto">
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label required>{t("codeLabel")}</Label>
              <Input value={code} maxLength={CODE_MAX_LENGTH} onChange={(e) => setCode(e.target.value)} placeholder={t("codePlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("classLabel")}</Label>
              <Select value={accountClass} onValueChange={(v) => setAccountClass(v as (typeof ACCOUNT_CLASSES)[number])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_CLASSES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {tClasses(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label required>{t("nameLabel")}</Label>
            <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("parentLabel")}</Label>
            <Combobox
              items={parentPickerItems}
              value={parentId}
              onChange={handleParentChange}
              placeholder={accountsQuery.isLoading ? t("loadingAccounts") : t("parentPlaceholder")}
              searchPlaceholder={t("parentSearchPlaceholder")}
              emptyText={t("parentEmptyText")}
              disabled={accountsQuery.isLoading}
            />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="create-account-is-postable"
              checked={isPostable}
              disabled={!parentId}
              onChange={(e) => setIsPostable(e.target.checked)}
            />
            <div>
              <Label htmlFor="create-account-is-postable">{t("isPostableLabel")}</Label>
              <p className="text-xs text-muted-foreground">{parentId ? t("isPostableHint") : t("isPostableHintNeedsParent")}</p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="create-account-is-control"
              checked={isControl}
              onChange={(e) => handleIsControlChange(e.target.checked)}
            />
            <Label htmlFor="create-account-is-control">{t("isControlLabel")}</Label>
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
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? t("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

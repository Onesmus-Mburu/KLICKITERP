"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreateFaCategoryDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { useAccounts as useGlAccounts } from "@/features/accounting/hooks/use-accounts";
import { useCreateCategory } from "../hooks/use-categories";

const NAME_MAX_LENGTH = 120; // fa_category.name is varchar(120) — fa-category.entity.ts.
const FA_CATEGORY_METHODS = ["SL", "RB"] as const;

/**
 * Phase 6 Slice 23 Part 1 (Fixed Assets foundations, Module 17) — the
 * category create form: `name` + `method` (a required `<Select>`,
 * `SL`/`RB`) + `lifeMonths` (positive int) + a conditional `rate` field
 * (shown and REQUIRED client-side only when `method='RB'` — the DTO itself
 * doesn't enforce this, only `CategoriesService.create()` does server-side
 * via a real `ValidationException`; see `categories.api.ts`'s own doc
 * comment) + `residualPct` (an optional fraction 0..1, "10% = 0.1000" hint,
 * defaulting to 0 if left blank) + 3 required GL account pickers (cost/
 * accum-dep/dep-expense).
 *
 * **GL account pickers**: reuse `features/accounting/hooks/use-accounts.ts`
 * (Slice 17) the same way `create-account-dialog.tsx` (Banking, Slice 21
 * Part 1) already does — `useGlAccounts({ isActive: true })` (server-side
 * active filter) narrowed further to `isPostable` client-side, since
 * `AccountsController.list()` has no `isPostable` filter param. Not
 * class-scoped — `CategoriesService.create()` imposes no GL-account-class
 * restriction beyond active+postable, confirmed by reading it directly.
 *
 * `uq_fa_category_name`'s 409 (this part's own opportunistic backend fix) is
 * never pre-validated client-side (no cheap "list every name" endpoint) — a
 * real `409` is surfaced verbatim via `ApiError.message`.
 */
export function CreateCategoryDialog() {
  const t = useTranslations("fixedAssets.categories.createDialog");
  const tMethods = useTranslations("fixedAssets.categoryMethods");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [method, setMethod] = React.useState<(typeof FA_CATEGORY_METHODS)[number]>("SL");
  const [lifeMonths, setLifeMonths] = React.useState("");
  const [rate, setRate] = React.useState("");
  const [residualPct, setResidualPct] = React.useState("");
  const [glCostAccountId, setGlCostAccountId] = React.useState("");
  const [glAccumDepAccountId, setGlAccumDepAccountId] = React.useState("");
  const [glDepExpenseAccountId, setGlDepExpenseAccountId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateCategory();
  const glAccountsQuery = useGlAccounts({ isActive: true });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName("");
      setMethod("SL");
      setLifeMonths("");
      setRate("");
      setResidualPct("");
      setGlCostAccountId("");
      setGlAccumDepAccountId("");
      setGlDepExpenseAccountId("");
      setError(null);
    }
  }

  const glAccountItems = React.useMemo(
    () => (glAccountsQuery.data ?? []).filter((a) => a.isPostable && a.isActive).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
    [glAccountsQuery.data],
  );

  const lifeMonthsNum = Number(lifeMonths);
  const canSubmit =
    name.trim().length > 0 &&
    Number.isInteger(lifeMonthsNum) &&
    lifeMonthsNum > 0 &&
    (method !== "RB" || (rate.trim().length > 0 && Number(rate) > 0)) &&
    !!glCostAccountId &&
    !!glAccumDepAccountId &&
    !!glDepExpenseAccountId;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: CreateFaCategoryDto = {
      name: name.trim(),
      method,
      lifeMonths: lifeMonthsNum,
      ...(method === "RB" ? { rate: rate.trim() } : {}),
      ...(residualPct.trim() ? { residualPct: residualPct.trim() } : {}),
      glCostAccountId,
      glAccumDepAccountId,
      glDepExpenseAccountId,
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
            <Label required>{t("nameLabel")}</Label>
            <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("methodLabel")}</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as (typeof FA_CATEGORY_METHODS)[number])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FA_CATEGORY_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {tMethods(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label required>{t("lifeMonthsLabel")}</Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={lifeMonths}
                onChange={(e) => setLifeMonths(e.target.value)}
                placeholder={t("lifeMonthsPlaceholder")}
              />
            </div>
          </div>

          {method === "RB" && (
            <div className="space-y-1.5">
              <Label required>{t("rateLabel")}</Label>
              <Input value={rate} onChange={(e) => setRate(e.target.value)} placeholder={t("ratePlaceholder")} />
              <p className="text-xs text-muted-foreground">{t("rateHint")}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t("residualPctLabel")}</Label>
            <Input value={residualPct} onChange={(e) => setResidualPct(e.target.value)} placeholder={t("residualPctPlaceholder")} />
            <p className="text-xs text-muted-foreground">{t("residualPctHint")}</p>
          </div>

          <div className="space-y-1.5">
            <Label required>{t("glCostAccountLabel")}</Label>
            <Combobox
              items={glAccountItems}
              value={glCostAccountId}
              onChange={setGlCostAccountId}
              placeholder={glAccountsQuery.isLoading ? t("loadingAccounts") : t("glAccountPlaceholder")}
              searchPlaceholder={t("glAccountSearchPlaceholder")}
              emptyText={t("glAccountEmptyText")}
              disabled={glAccountsQuery.isLoading}
            />
          </div>

          <div className="space-y-1.5">
            <Label required>{t("glAccumDepAccountLabel")}</Label>
            <Combobox
              items={glAccountItems}
              value={glAccumDepAccountId}
              onChange={setGlAccumDepAccountId}
              placeholder={glAccountsQuery.isLoading ? t("loadingAccounts") : t("glAccountPlaceholder")}
              searchPlaceholder={t("glAccountSearchPlaceholder")}
              emptyText={t("glAccountEmptyText")}
              disabled={glAccountsQuery.isLoading}
            />
          </div>

          <div className="space-y-1.5">
            <Label required>{t("glDepExpenseAccountLabel")}</Label>
            <Combobox
              items={glAccountItems}
              value={glDepExpenseAccountId}
              onChange={setGlDepExpenseAccountId}
              placeholder={glAccountsQuery.isLoading ? t("loadingAccounts") : t("glAccountPlaceholder")}
              searchPlaceholder={t("glAccountSearchPlaceholder")}
              emptyText={t("glAccountEmptyText")}
              disabled={glAccountsQuery.isLoading}
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

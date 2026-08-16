"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import type { FaCategoryResponseDto, UpdateFaCategoryDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { useAccounts as useGlAccounts } from "@/features/accounting/hooks/use-accounts";
import { useUpdateCategory } from "../hooks/use-categories";

const NAME_MAX_LENGTH = 120;
const FA_CATEGORY_METHODS = ["SL", "RB"] as const;

/**
 * Phase 6 Slice 23 Part 1 (Fixed Assets foundations, Module 17) — **a
 * genuine exception to this codebase's usual "immutable fields get omitted
 * from edit" pattern**: `UpdateFaCategoryDto` accepts every field
 * `CreateFaCategoryDto` does, INCLUDING `name`/`method` — confirmed by
 * reading `CategoriesService.update()` directly, nothing on this entity is
 * create-only. This dialog therefore shows ALL the same fields as
 * `create-category-dialog.tsx`, pre-filled with the category's current
 * values, and submits a plain field-by-field diff (only genuinely changed
 * fields go on the wire) — the same diff shape `edit-account-dialog.tsx`
 * (Banking) already establishes.
 *
 * `rate`'s client-side "required when RB" nicety applies here too (the real
 * enforcement is server-side, see `categories.api.ts`'s own doc comment).
 */
export function EditCategoryDialog({ category }: { category: FaCategoryResponseDto }) {
  const t = useTranslations("fixedAssets.categories.editDialog");
  const tMethods = useTranslations("fixedAssets.categoryMethods");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(category.name);
  const [method, setMethod] = React.useState<(typeof FA_CATEGORY_METHODS)[number]>(category.method as (typeof FA_CATEGORY_METHODS)[number]);
  const [lifeMonths, setLifeMonths] = React.useState(String(category.lifeMonths));
  const [rate, setRate] = React.useState(category.rate ?? "");
  const [residualPct, setResidualPct] = React.useState(category.residualPct);
  const [glCostAccountId, setGlCostAccountId] = React.useState(category.glCostAccountId);
  const [glAccumDepAccountId, setGlAccumDepAccountId] = React.useState(category.glAccumDepAccountId);
  const [glDepExpenseAccountId, setGlDepExpenseAccountId] = React.useState(category.glDepExpenseAccountId);
  const [error, setError] = React.useState<string | null>(null);

  const updateMutation = useUpdateCategory();
  const glAccountsQuery = useGlAccounts({ isActive: true });

  function resetToCategory() {
    setName(category.name);
    setMethod(category.method as (typeof FA_CATEGORY_METHODS)[number]);
    setLifeMonths(String(category.lifeMonths));
    setRate(category.rate ?? "");
    setResidualPct(category.residualPct);
    setGlCostAccountId(category.glCostAccountId);
    setGlAccumDepAccountId(category.glAccumDepAccountId);
    setGlDepExpenseAccountId(category.glDepExpenseAccountId);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) resetToCategory();
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
    const dto: UpdateFaCategoryDto = {};
    if (name.trim() !== category.name) dto.name = name.trim();
    if (method !== category.method) dto.method = method;
    if (lifeMonthsNum !== category.lifeMonths) dto.lifeMonths = lifeMonthsNum;
    const originalRate = category.rate ?? "";
    if (rate.trim() !== originalRate) dto.rate = rate.trim();
    if (residualPct.trim() !== category.residualPct) dto.residualPct = residualPct.trim();
    if (glCostAccountId !== category.glCostAccountId) dto.glCostAccountId = glCostAccountId;
    if (glAccumDepAccountId !== category.glAccumDepAccountId) dto.glAccumDepAccountId = glAccumDepAccountId;
    if (glDepExpenseAccountId !== category.glDepExpenseAccountId) dto.glDepExpenseAccountId = glDepExpenseAccountId;

    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: category.id, dto });
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
          <DialogTitle>{t("title", { name: category.name })}</DialogTitle>
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
              <Input type="number" min={1} step={1} value={lifeMonths} onChange={(e) => setLifeMonths(e.target.value)} />
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
            <Input value={residualPct} onChange={(e) => setResidualPct(e.target.value)} />
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
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || updateMutation.isPending}>
            {updateMutation.isPending ? t("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil, X } from "lucide-react";
import type { CategoryResponseDto, UpdateCategoryDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useAccounts } from "@/features/accounting/hooks/use-accounts";
import { useCategories, useUpdateCategory } from "../hooks/use-categories";

const NAME_MAX_LENGTH = 120; // exp_category.name is varchar(120) — exp-category.entity.ts.

/**
 * Phase 6 Slice 20 Part 1 (Expenses Foundations, Module 14) — a plain two-way
 * diff (name, parentId, glExpenseAccountId, budgetRequired, isActive), the
 * same shape `edit-cost-center-dialog.tsx`/Inventory's own
 * `edit-category-dialog.tsx` establish. `parentId` supports explicit-`null`-
 * to-clear (the REAL, correctly-typed `UpdateCategoryDto.parentId` accepts
 * `string | null | undefined` — the generated-shape gap on this one field is
 * absorbed entirely inside `categories.api.ts`'s own request-body cast
 * boundary, never visible here).
 *
 * The parent picker excludes THIS category from its own options (a category
 * can't be its own parent) — deeper cycle prevention is left to the server's
 * own validation, matching the "flat picker, not a recursive tree" scope
 * this part's own brief sets. The GL expense account picker is the SAME
 * EXPENSE-class-filtered picker `create-category-dialog.tsx` uses, so a role
 * can only ever re-point a category at another valid BR-EXP-01 account.
 */
export function EditCategoryDialog({ category }: { category: CategoryResponseDto }) {
  const t = useTranslations("expenses.categories.editDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(category.name);
  const [parentId, setParentId] = React.useState(category.parentId ?? "");
  const [glExpenseAccountId, setGlExpenseAccountId] = React.useState(category.glExpenseAccountId);
  const [budgetRequired, setBudgetRequired] = React.useState(category.budgetRequired);
  const [isActive, setIsActive] = React.useState(category.isActive);
  const [error, setError] = React.useState<string | null>(null);

  const updateMutation = useUpdateCategory();
  const categoriesQuery = useCategories();
  const accountsQuery = useAccounts({ class: "EXPENSE", isActive: true });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName(category.name);
      setParentId(category.parentId ?? "");
      setGlExpenseAccountId(category.glExpenseAccountId);
      setBudgetRequired(category.budgetRequired);
      setIsActive(category.isActive);
      setError(null);
    }
  }

  const parentItems = React.useMemo(
    () => (categoriesQuery.data ?? []).filter((c) => c.id !== category.id).map((c) => ({ value: c.id, label: c.name })),
    [categoriesQuery.data, category.id],
  );
  const expenseAccountItems = React.useMemo(
    () => (accountsQuery.data ?? []).filter((a) => a.isPostable && a.isActive).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
    [accountsQuery.data],
  );

  const originalParentId = category.parentId ?? "";
  const canSubmit = name.trim().length > 0 && !!glExpenseAccountId;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: UpdateCategoryDto = {};
    if (name.trim() !== category.name) dto.name = name.trim();
    if (parentId !== originalParentId) dto.parentId = parentId === "" ? null : parentId;
    if (glExpenseAccountId !== category.glExpenseAccountId) dto.glExpenseAccountId = glExpenseAccountId;
    if (budgetRequired !== category.budgetRequired) dto.budgetRequired = budgetRequired;
    if (isActive !== category.isActive) dto.isActive = isActive;
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
          <div className="space-y-1.5">
            <Label>{t("parentLabel")}</Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Combobox
                  items={parentItems}
                  value={parentId}
                  onChange={setParentId}
                  placeholder={categoriesQuery.isLoading ? t("loadingCategories") : t("parentPlaceholder")}
                  searchPlaceholder={t("parentSearchPlaceholder")}
                  emptyText={t("parentEmptyText")}
                  disabled={categoriesQuery.isLoading}
                />
              </div>
              {parentId && (
                <Button type="button" variant="outline" size="icon" onClick={() => setParentId("")} aria-label={t("clearParent")}>
                  <X className="size-4" />
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("glExpenseAccountLabel")}</Label>
            <Combobox
              items={expenseAccountItems}
              value={glExpenseAccountId}
              onChange={setGlExpenseAccountId}
              placeholder={accountsQuery.isLoading ? t("loadingAccounts") : t("glExpenseAccountPlaceholder")}
              searchPlaceholder={t("glExpenseAccountSearchPlaceholder")}
              emptyText={t("glExpenseAccountEmptyText")}
              disabled={accountsQuery.isLoading}
            />
          </div>
          <div className="flex items-start gap-2">
            <Checkbox id="edit-exp-category-budget-required" checked={budgetRequired} onChange={(e) => setBudgetRequired(e.target.checked)} />
            <div>
              <Label htmlFor="edit-exp-category-budget-required">{t("budgetRequiredLabel")}</Label>
              <p className="text-xs text-muted-foreground">{t("budgetRequiredHint")}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox id="edit-exp-category-is-active" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <Label htmlFor="edit-exp-category-is-active">{t("isActiveLabel")}</Label>
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

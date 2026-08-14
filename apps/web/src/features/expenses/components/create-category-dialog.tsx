"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreateCategoryDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useAccounts } from "@/features/accounting/hooks/use-accounts";
import { useCategories, useCreateCategory } from "../hooks/use-categories";

const NAME_MAX_LENGTH = 120; // exp_category.name is varchar(120) — exp-category.entity.ts.

/**
 * Phase 6 Slice 20 Part 1 (Expenses Foundations, Module 14) — the category
 * create form: `name` + an optional flat parent picker (mirrors Inventory's
 * own `create-category-dialog.tsx`, Slice 19 Part 1 — "a simple parent-picker
 * dropdown, not a recursive tree" is this part's own explicit scope too) +
 * **BR-EXP-01's required `glExpenseAccountId` picker**, reusing
 * `features/accounting/hooks/use-accounts.ts` (Slice 17) filtered server-side
 * to `class: "EXPENSE"` and client-side to `isPostable && isActive` — the
 * same "postable + active" filter `journal-line-editor.tsx`/`create-budget-dialog.tsx`/
 * Inventory's own item dialogs already establish, narrowed further here to
 * EXPENSE-class only since that's what BR-EXP-01 actually requires (a
 * category's expense account must be an EXPENSE-class account, not any
 * postable account). This makes the picker itself the client-side guard: it
 * never OFFERS an invalid account, so BR-EXP-01's server-side rejection
 * (surfaced verbatim via `ApiError.message` if it somehow still occurs) is
 * not independently re-validated here. `budgetRequired`/`isActive` are plain
 * checkboxes, defaulting to `false`/`true` respectively — matching
 * `CreateCategoryDto`'s own Swagger `default` values (see `categories.api.ts`'s
 * own doc comment on the codegen gap those defaults cause).
 *
 * Globally-unique `name` (`uq_exp_category_name`) — a duplicate-name create
 * attempt is rejected server-side and surfaced via `ApiError.message`, not
 * pre-validated client-side (no "list every name" endpoint to check against
 * cheaply).
 */
export function CreateCategoryDialog() {
  const t = useTranslations("expenses.categories.createDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [parentId, setParentId] = React.useState("");
  const [glExpenseAccountId, setGlExpenseAccountId] = React.useState("");
  const [budgetRequired, setBudgetRequired] = React.useState(false);
  const [isActive, setIsActive] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateCategory();
  const categoriesQuery = useCategories();
  const accountsQuery = useAccounts({ class: "EXPENSE", isActive: true });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName("");
      setParentId("");
      setGlExpenseAccountId("");
      setBudgetRequired(false);
      setIsActive(true);
      setError(null);
    }
  }

  const parentItems = React.useMemo(
    () => (categoriesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    [categoriesQuery.data],
  );
  const expenseAccountItems = React.useMemo(
    () => (accountsQuery.data ?? []).filter((a) => a.isPostable && a.isActive).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
    [accountsQuery.data],
  );
  const canSubmit = name.trim().length > 0 && !!glExpenseAccountId;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: CreateCategoryDto = {
      name: name.trim(),
      ...(parentId ? { parentId } : {}),
      glExpenseAccountId,
      budgetRequired,
      isActive,
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
          <div className="space-y-1.5">
            <Label>{t("parentLabel")}</Label>
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
            <p className="text-xs text-muted-foreground">{t("glExpenseAccountHint")}</p>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox id="create-exp-category-budget-required" checked={budgetRequired} onChange={(e) => setBudgetRequired(e.target.checked)} />
            <div>
              <Label htmlFor="create-exp-category-budget-required">{t("budgetRequiredLabel")}</Label>
              <p className="text-xs text-muted-foreground">{t("budgetRequiredHint")}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox id="create-exp-category-is-active" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <Label htmlFor="create-exp-category-is-active">{t("isActiveLabel")}</Label>
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

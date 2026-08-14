"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil, X } from "lucide-react";
import type { domains_inventory_category_schema } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useCategories, useUpdateCategory } from "../hooks/use-categories";

const NAME_MAX_LENGTH = 120; // inv_category.name is varchar(120) — inv-category.entity.ts.

type UpdateCategoryDto = domains_inventory_category_schema.UpdateCategoryDto;
type CategoryResponseDto = domains_inventory_category_schema.CategoryResponseDto;

/**
 * Phase 6 Slice 19 Part 1 (Inventory Foundations, Module 13) — a plain
 * two-way diff (name, parentId), the same shape `edit-cost-center-dialog.tsx`
 * establishes, plus `parentId`'s explicit-`null`-to-clear handling (`Update
 * CategoryDto.parentId` accepts real `null`, no codegen gap on this
 * particular field — see `categories.api.ts`'s own doc comment: the request-
 * BODY shape collision only affects the OTHER fields expenses' own DTO adds,
 * `parentId` itself is identical in both).
 *
 * The parent picker excludes THIS category from its own options (a category
 * can't be its own parent) — deeper cycle prevention (e.g. picking one of
 * this category's own descendants as its new parent) is left to the server's
 * own validation, matching this part's explicit "flat picker, not a
 * recursive tree" scope (no cheap client-side way to know descendants
 * without a tree traversal this part deliberately doesn't build).
 */
export function EditCategoryDialog({ category }: { category: CategoryResponseDto }) {
  const t = useTranslations("inventory.categories.editDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(category.name);
  const [parentId, setParentId] = React.useState(category.parentId ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateCategory();
  const categoriesQuery = useCategories();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName(category.name);
      setParentId(category.parentId ?? "");
      setError(null);
    }
  }

  const parentItems = React.useMemo(
    () => (categoriesQuery.data ?? []).filter((c) => c.id !== category.id).map((c) => ({ value: c.id, label: c.name })),
    [categoriesQuery.data, category.id],
  );

  const originalParentId = category.parentId ?? "";
  const canSubmit = name.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: UpdateCategoryDto = {};
    if (name.trim() !== category.name) dto.name = name.trim();
    if (parentId !== originalParentId) dto.parentId = parentId === "" ? null : parentId;
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

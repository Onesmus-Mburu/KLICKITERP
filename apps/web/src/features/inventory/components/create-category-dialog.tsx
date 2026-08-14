"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { domains_inventory_category_schema } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useCategories, useCreateCategory } from "../hooks/use-categories";

const NAME_MAX_LENGTH = 120; // inv_category.name is varchar(120) — inv-category.entity.ts.

type CreateCategoryDto = domains_inventory_category_schema.CreateCategoryDto;

/**
 * Phase 6 Slice 19 Part 1 (Inventory Foundations, Module 13) — the category
 * create form: `name` + an optional parent picker. Globally-unique `name`
 * (not unique-per-parent, per this part's own brief) — a duplicate-name
 * create attempt is rejected server-side and surfaced via `ApiError.message`,
 * not pre-validated client-side (no "list every name" endpoint to check
 * against cheaply). **The real rejection is a raw `500` with a leaked SQL
 * constraint-name message, not a clean 409/422** — a genuine backend gap
 * confirmed live and documented in full in `categories.api.ts`'s own doc
 * comment; this dialog's generic `err.message` fallback still surfaces
 * SOMETHING regardless of status code, just an unpolished message.
 *
 * **Flat parent picker, not a recursive tree** — per this part's own
 * explicit instruction ("a simple parent-picker dropdown showing existing
 * categories is enough, don't build a recursive tree view"): `useCategories()`
 * (no `parentId` filter — every existing category, any depth) feeds a plain
 * `<Combobox>` showing each category's own `name`, mirroring
 * `create-account-dialog.tsx`'s own flat parent-account picker shape (Slice
 * 17 Part 1's own precedent for "no dedicated hierarchy-aware picker exists,
 * trust the user").
 */
export function CreateCategoryDialog() {
  const t = useTranslations("inventory.categories.createDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [parentId, setParentId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const createMutation = useCreateCategory();
  const categoriesQuery = useCategories();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName("");
      setParentId("");
      setError(null);
    }
  }

  const parentItems = React.useMemo(
    () => (categoriesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    [categoriesQuery.data],
  );
  const canSubmit = name.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: CreateCategoryDto = {
      name: name.trim(),
      ...(parentId ? { parentId } : {}),
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

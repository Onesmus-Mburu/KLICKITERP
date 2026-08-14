"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import type { CreateStockTakeDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { useStores } from "../hooks/use-stores";
import { useCreateStockTake } from "../hooks/use-stock-takes";
import { ItemCombobox, type SelectedInventoryItem } from "./item-combobox";

type ScopeMode = "ALL" | "ITEMS";

/**
 * Phase 6 Slice 19 Part 3 (Stock Takes, the last part of Module 13) — the
 * stock-take create form: a store picker (`<Select>`, mirroring
 * `transfer-form.tsx`'s own from/to-store pickers) + an ALL-vs-explicit-items
 * scope choice.
 *
 * **Explicit items uses a simple repeatable "pick one, add to list" pattern
 * rather than extending `<ItemCombobox>` for real multi-select** — per this
 * part's own explicit "a simple repeatable single-select-and-add-to-list
 * pattern is fine if easier than modifying the combobox itself" allowance:
 * `<ItemCombobox>` stays exactly as Part 1 shipped it (a single external
 * `value`, `onSelect(item|null)`), untouched here; this dialog just clears
 * its own local `pendingItemId` back to `""` after each Add, letting the
 * SAME combobox instance be reused to pick the next item. Duplicate adds are
 * silently ignored (`addItem()`'s own `some()` check) rather than surfaced as
 * an error — picking an already-added item twice is a harmless no-op, not a
 * mistake worth interrupting the user over.
 *
 * **`"ALL"` requires the store to already have at least one `inv_stock_balance`
 * row** (`StockTakesService.createSession()`'s own real business rule,
 * confirmed live — see `docs/phase-6/PROGRESS.md`) — surfaced verbatim via
 * `ApiError.message` if chosen for an empty store, the same "don't
 * genericize a real server message" discipline every prior dialog in this
 * feature already established.
 */
export function CreateStockTakeDialog() {
  const t = useTranslations("inventory.stockTakes.createDialog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [storeId, setStoreId] = React.useState("");
  const [scopeMode, setScopeMode] = React.useState<ScopeMode>("ALL");
  const [pendingItemId, setPendingItemId] = React.useState("");
  const [selectedItems, setSelectedItems] = React.useState<SelectedInventoryItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const storesQuery = useStores(true);
  const createMutation = useCreateStockTake();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setStoreId("");
      setScopeMode("ALL");
      setPendingItemId("");
      setSelectedItems([]);
      setError(null);
    }
  }

  function handleItemPick(item: SelectedInventoryItem | null) {
    if (!item) return;
    setSelectedItems((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, item]));
    setPendingItemId("");
  }

  function removeItem(id: string) {
    setSelectedItems((prev) => prev.filter((i) => i.id !== id));
  }

  const canSubmit = !!storeId && (scopeMode === "ALL" || selectedItems.length > 0);

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: CreateStockTakeDto = {
      storeId,
      scope: scopeMode === "ALL" ? { itemIds: "ALL" } : { itemIds: selectedItems.map((i) => i.id) },
    };
    try {
      const stockTake = await createMutation.mutateAsync(dto);
      setOpen(false);
      router.push(`/inventory/stock-takes/${stockTake.id}`);
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
      <DialogContent className="sm:max-w-lg">
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
            <Label required>{t("storeLabel")}</Label>
            <Select value={storeId} onValueChange={setStoreId} disabled={storesQuery.isLoading}>
              <SelectTrigger>
                <SelectValue placeholder={storesQuery.isLoading ? t("loadingStores") : t("storePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {(storesQuery.data ?? []).map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label required>{t("scopeLabel")}</Label>
            <Select value={scopeMode} onValueChange={(v) => setScopeMode(v as ScopeMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("scopeAll")}</SelectItem>
                <SelectItem value="ITEMS">{t("scopeItems")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{scopeMode === "ALL" ? t("scopeAllHint") : t("scopeItemsHint")}</p>
          </div>

          {scopeMode === "ITEMS" && (
            <div className="space-y-2">
              <Label>{t("addItemLabel")}</Label>
              <ItemCombobox value={pendingItemId} onSelect={handleItemPick} />
              {selectedItems.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedItems.map((item) => (
                    <Badge key={item.id} variant="soft-secondary" className="gap-1 pr-1">
                      {item.code} — {item.name}
                      <button type="button" onClick={() => removeItem(item.id)} aria-label={t("removeItem")} className="rounded-full p-0.5 hover:bg-tint-destructive">
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {selectedItems.length === 0 && <p className="text-xs text-muted-foreground">{t("noItemsSelected")}</p>}
            </div>
          )}
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

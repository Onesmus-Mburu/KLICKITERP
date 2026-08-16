"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import type { CreateFaVerificationDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { useAssets } from "../hooks/use-assets";
import { useCreateVerification } from "../hooks/use-verifications";
import { AssetCombobox } from "./asset-combobox";

type ScopeMode = "ALL" | "EXPLICIT";

/**
 * Phase 6 Slice 23 Part 5 (Fixed Assets, Module 17) — `POST
 * /fixed-assets/verifications`, THE FINAL new dialog of this whole slice.
 * Mirrors Inventory's own `create-stock-take-dialog.tsx` (Slice 19 Part 3),
 * the closest UX precedent this codebase has for an "ALL or explicit scope"
 * picker on a physical-count session: a scope-mode `<Select>` (`ALL` vs
 * `EXPLICIT`) plus, for `EXPLICIT`, a simple repeatable "pick one via
 * `<AssetCombobox>`, add to a badge list" pattern — the SAME judgment call
 * `create-stock-take-dialog.tsx`'s own doc comment already makes ("a simple
 * repeatable single-select-and-add-to-list pattern is fine" rather than
 * building a genuine multi-select variant of the combobox).
 *
 * **`"ALL"` resolves to every currently `ACTIVE` asset AT CREATION TIME —
 * a real, immediate snapshot, not a live-updating scope** (confirmed by
 * reading `VerificationService.createSession()` directly) — and THROWS if
 * zero `ACTIVE` assets exist anywhere in the whole database. This is
 * deliberately the riskier option (it sweeps every remaining active asset
 * system-wide, including ones from unrelated modules/slices), so
 * `scopeAllHint` says so plainly; `EXPLICIT` is the safer, narrower choice
 * for a real, bounded physical count and is this dialog's own default.
 *
 * **`<AssetCombobox>` reused directly** (Part 4's own component, built
 * standalone specifically anticipating this reuse) — its own default
 * `status: "ACTIVE"` filter is kept as-is here too, the same reasoning: a
 * verification session counting a `DISPOSED`/`WRITTEN_OFF`/`UNDER_MAINTENANCE`
 * asset would be unusual enough that the safer default excludes them,
 * matching this dialog's own scope-selector framing.
 */
export function CreateVerificationDialog() {
  const t = useTranslations("fixedAssets.verifications.createDialog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [scopeMode, setScopeMode] = React.useState<ScopeMode>("EXPLICIT");
  const [pendingAssetId, setPendingAssetId] = React.useState("");
  const [selectedAssetIds, setSelectedAssetIds] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateVerification();
  const assetsQuery = useAssets();
  const assetLabelById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const asset of assetsQuery.data ?? []) map.set(asset.id, `${asset.code} — ${asset.name}`);
    return map;
  }, [assetsQuery.data]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setScopeMode("EXPLICIT");
      setPendingAssetId("");
      setSelectedAssetIds([]);
      setError(null);
    }
  }

  function handleAssetPick(id: string) {
    if (!id) return;
    setSelectedAssetIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setPendingAssetId("");
  }

  function removeAsset(id: string) {
    setSelectedAssetIds((prev) => prev.filter((existing) => existing !== id));
  }

  const canSubmit = scopeMode === "ALL" || selectedAssetIds.length > 0;

  async function handleSubmit() {
    if (!canSubmit || createMutation.isPending) return;
    setError(null);
    const dto: CreateFaVerificationDto = {
      scope: scopeMode === "ALL" ? { assetIds: "ALL" } : { assetIds: selectedAssetIds },
    };
    try {
      const verification = await createMutation.mutateAsync(dto);
      setOpen(false);
      router.push(`/fixed-assets/verifications/${verification.id}`);
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
            <Label required>{t("scopeLabel")}</Label>
            <Select value={scopeMode} onValueChange={(v) => setScopeMode(v as ScopeMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EXPLICIT">{t("scopeExplicit")}</SelectItem>
                <SelectItem value="ALL">{t("scopeAll")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{scopeMode === "ALL" ? t("scopeAllHint") : t("scopeExplicitHint")}</p>
          </div>

          {scopeMode === "EXPLICIT" && (
            <div className="space-y-2">
              <Label>{t("addAssetLabel")}</Label>
              <AssetCombobox
                value={pendingAssetId}
                onChange={handleAssetPick}
                placeholder={t("assetPlaceholder")}
                searchPlaceholder={t("assetSearchPlaceholder")}
                emptyText={t("assetEmptyText")}
                loadingText={t("loadingAssets")}
              />
              {selectedAssetIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedAssetIds.map((id) => (
                    <Badge key={id} variant="soft-secondary" className="gap-1 pr-1">
                      {assetLabelById.get(id) ?? id}
                      <button type="button" onClick={() => removeAsset(id)} aria-label={t("removeAsset")} className="rounded-full p-0.5 hover:bg-tint-destructive">
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {selectedAssetIds.length === 0 && <p className="text-xs text-muted-foreground">{t("noAssetsSelected")}</p>}
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

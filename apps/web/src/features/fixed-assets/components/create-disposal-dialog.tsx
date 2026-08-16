"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/patterns/money-input";
import { ApiError } from "@/lib/api-error";
import { formatMoney, isValidDecimalString, sumMoneyStrings } from "@/lib/money";
import { useAsset } from "../hooks/use-assets";
import { useCreateDisposal } from "../hooks/use-disposals";
import { AssetCombobox } from "./asset-combobox";

const FA_DISPOSAL_METHODS = ["SALE", "SCRAP", "DONATION", "WRITE_OFF"] as const;
type FaDisposalMethod = (typeof FA_DISPOSAL_METHODS)[number];

/** `create()`'s own real default — see `disposal.service.ts:56-84`. This dialog only PRE-FILLS `"0"` for these 2 methods as a convenience; the server's own real default applies regardless of what this dialog sends. */
const ZERO_PROCEEDS_METHODS: readonly FaDisposalMethod[] = ["DONATION", "WRITE_OFF"];

/** `lib/money.ts` has no subtraction helper (only `sumMoneyStrings()`) — see `depreciation-run-lines-table.tsx`'s own identical local helper for why this is duplicated here rather than added to the shared lib for a 2-caller need (this file and `disposal-journal-preview.tsx`). */
function negateDecimalString(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("-")) return trimmed.slice(1);
  if (/^0(\.0+)?$/.test(trimmed)) return trimmed;
  return `-${trimmed}`;
}

/**
 * Phase 6 Slice 23 Part 4 (Fixed Assets, Module 17) — `POST
 * /fixed-assets/disposals`. Picks an asset (`<AssetCombobox>`, defaulted to
 * `ACTIVE`-only) and a method, optionally enters `proceeds`.
 *
 * **Live gain/loss preview** — `gainLoss = proceeds - NBV`,
 * `NBV = asset.cost - asset.accumDepreciation`, computed and FROZEN
 * server-side at creation (confirmed by reading `create()` directly,
 * `disposal.service.ts:56-84`). This dialog echoes the SAME formula
 * client-side, using the SAME already-fetched asset fields
 * (`asset.cost`/`asset.accumDepreciation`, via Part 1's own `useAsset()`) —
 * a real computation mirroring the server's, not a guess, though it can only
 * ever be a PREVIEW: the real, authoritative figure is whatever the server
 * returns from `create()`.
 *
 * **Proceeds pre-fills to `"0"` for DONATION/WRITE_OFF only when the field
 * is still empty** — a convenience default per this part's own task brief,
 * never forced: switching methods never overwrites a proceeds value the
 * user already typed, and SALE/SCRAP remain fully free-entry with no
 * default at all.
 *
 * **BR-FA-02 guard, client-side** — `<AssetCombobox>` already filters to
 * `ACTIVE` assets by default, but a caller passing `initialAssetId` (Part
 * 5's own write-off-linking use, see below) bypasses that filter entirely.
 * This dialog independently re-checks the SELECTED asset's own live
 * `status` (via `useAsset()`) and disables Create outright if it's already
 * `DISPOSED`/`WRITTEN_OFF`, with an explicit warning — the real DB trigger
 * is still the actual backstop (a clean 409 either way, surfaced verbatim),
 * this is a client-side convenience, not a substitute for it.
 *
 * **`initialAssetId`/`initialMethod` (both optional)** — a small, cheap
 * addition for Part 5 (Verification)'s own future benefit, per this part's
 * own task brief: that part's own missing-asset write-off flow is expected
 * to open THIS SAME dialog pre-filled (`initialMethod: "WRITE_OFF"`) rather
 * than building a separate creation UI. Pre-fills the corresponding form
 * state on open; both remain fully editable afterward, not locked.
 *
 * **`trigger` (optional, Phase 6 Slice 23 Part 5)** — a further small,
 * additive prop for the same missing-asset write-off-linking use: this
 * dialog's own default trigger button always reads "New Disposal"
 * (`t("trigger")`), which reads oddly repeated once per row on
 * `missing-assets-report.tsx`'s own report table. Passing a custom
 * `trigger` node swaps ONLY the visible trigger content (still wired
 * through the same `<DialogTrigger asChild>`) — every existing caller
 * (the disposals list page, calling this with zero props) is completely
 * unaffected, since the prop defaults to the original button.
 */
export function CreateDisposalDialog({
  initialAssetId,
  initialMethod,
  trigger,
}: {
  /** Pre-fills the asset picker's initial selection. */
  initialAssetId?: string;
  /** Pre-fills the method select's initial selection — Part 5 is expected to pass `"WRITE_OFF"`. */
  initialMethod?: FaDisposalMethod;
  /** Overrides the default "New Disposal" trigger button's visible content — see this file's own doc comment. */
  trigger?: React.ReactNode;
} = {}) {
  const t = useTranslations("fixedAssets.disposals.createDialog");
  const tMethods = useTranslations("fixedAssets.disposalMethods");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [assetId, setAssetId] = React.useState(initialAssetId ?? "");
  const [method, setMethod] = React.useState<FaDisposalMethod | "">(initialMethod ?? "");
  const [proceeds, setProceeds] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateDisposal();
  const assetQuery = useAsset(assetId || undefined);

  function resetForm() {
    setAssetId(initialAssetId ?? "");
    setMethod(initialMethod ?? "");
    setProceeds("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) resetForm();
  }

  function handleMethodChange(next: FaDisposalMethod) {
    setMethod(next);
    if (ZERO_PROCEEDS_METHODS.includes(next) && proceeds === "") {
      setProceeds("0");
    }
  }

  const asset = assetQuery.data;
  const assetAlreadyDisposed = asset ? asset.status === "DISPOSED" || asset.status === "WRITTEN_OFF" : false;

  const nbv = asset ? sumMoneyStrings([asset.cost, negateDecimalString(asset.accumDepreciation)]) : null;
  const proceedsForPreview = proceeds && isValidDecimalString(proceeds) ? proceeds : "0";
  const gainLossPreview = nbv !== null ? sumMoneyStrings([proceedsForPreview, negateDecimalString(nbv)]) : null;
  const gainLossSign: "loss" | "gain" | "zero" | null =
    gainLossPreview === null ? null : gainLossPreview.trim().startsWith("-") ? "loss" : /^0(\.0+)?$/.test(gainLossPreview.trim()) ? "zero" : "gain";

  const canSubmit = !!assetId && !!method && !assetAlreadyDisposed && !createMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit || !method) return;
    setError(null);
    try {
      const created = await createMutation.mutateAsync({
        assetId,
        method,
        proceeds: proceeds !== "" ? proceeds : undefined,
      });
      setOpen(false);
      router.push(`/fixed-assets/disposals/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button">
            <Plus className="size-4" />
            {t("trigger")}
          </Button>
        )}
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

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label required>{t("assetLabel")}</Label>
            <AssetCombobox
              value={assetId}
              onChange={setAssetId}
              placeholder={t("assetPlaceholder")}
              searchPlaceholder={t("assetSearchPlaceholder")}
              emptyText={t("assetEmptyText")}
              loadingText={t("loadingAssets")}
            />
            {assetAlreadyDisposed && <p className="text-xs text-destructive">{t("assetAlreadyDisposedWarning")}</p>}
          </div>

          <div className="space-y-1.5">
            <Label required>{t("methodLabel")}</Label>
            <Select value={method} onValueChange={(v) => handleMethodChange(v as FaDisposalMethod)}>
              <SelectTrigger>
                <SelectValue placeholder={t("methodPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {FA_DISPOSAL_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {tMethods(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("proceedsLabel")}</Label>
            <MoneyInput value={proceeds} onValueChange={(v) => setProceeds(v ?? "")} />
            <p className="text-xs text-muted-foreground">
              {method && ZERO_PROCEEDS_METHODS.includes(method) ? t("proceedsZeroHint") : t("proceedsHint")}
            </p>
          </div>

          {asset && nbv !== null && (
            <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("previewTitle")}</p>
              <dl className="mt-1 space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{t("previewCostLabel")}</dt>
                  <dd className="text-foreground">{formatMoney(asset.cost)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{t("previewAccumDepLabel")}</dt>
                  <dd className="text-foreground">{formatMoney(asset.accumDepreciation)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{t("previewNbvLabel")}</dt>
                  <dd className="text-foreground">{formatMoney(nbv)}</dd>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-1 font-semibold">
                  <dt className={gainLossSign === "loss" ? "text-destructive" : gainLossSign === "gain" ? "text-success" : "text-foreground"}>
                    {gainLossSign === "loss" ? t("previewLossLabel") : gainLossSign === "gain" ? t("previewGainLabel") : t("previewBreakEvenLabel")}
                  </dt>
                  <dd className={gainLossSign === "loss" ? "text-destructive" : gainLossSign === "gain" ? "text-success" : "text-foreground"}>
                    {gainLossPreview !== null ? formatMoney(gainLossPreview) : "—"}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">{t("previewHint")}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {createMutation.isPending ? t("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

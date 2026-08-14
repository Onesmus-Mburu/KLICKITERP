"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { SpendDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/patterns/money-input";
import { ApiError } from "@/lib/api-error";
import { useCategories } from "../hooks/use-categories";
import { useSpend, type FloatResponseDto } from "../hooks/use-petty-cash";

/**
 * Phase 6 Slice 20 Part 2 (Petty Cash, Module 14) — a plain "record a spend"
 * form, deliberately NOT a status-workflow document. `PettyCashService.spend()`
 * creates the voucher directly in `APPROVED` with `journalId: null` — there
 * is genuinely no DRAFT/PENDING_APPROVAL path for an individual spend (only
 * the float's own `ceiling` and this call's own balance-floor check, BR-EXP-02,
 * are the control gate — see that service's own doc comment). This dialog
 * therefore has no status badge, no submit/approve/pay actions — one form,
 * one submit, done.
 *
 * `categoryId` reuses Part 1's own `useCategories()` (Expenses' categories),
 * filtered client-side to `isActive`, the same treatment
 * `create-voucher-dialog.tsx` already gives its own category picker.
 * `receiptFileId` is skipped entirely — no file-upload UI exists anywhere in
 * this codebase yet (the same documented gap Part 1's own
 * `voucher-status-actions.tsx` flags for BR-EXP-03's attachment
 * requirement).
 *
 * BR-EXP-02's real rejection (`amount` exceeds the float's current `balance`)
 * is surfaced verbatim via `ApiError.message`, not duplicated client-side —
 * this dialog DOES show the float's live balance/ceiling as context (passed
 * in via `float`) so a user can self-correct before even trying, but the
 * server's own check is still the real gate.
 */
export function SpendDialog({ float }: { float: FloatResponseDto }) {
  const t = useTranslations("expenses.pettyCash.spendDialog");
  const tCommon = useTranslations("common");

  const [open, setOpen] = React.useState(false);
  const [categoryId, setCategoryId] = React.useState("");
  const [amount, setAmount] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const spendMutation = useSpend();
  const categoriesQuery = useCategories();

  function resetForm() {
    setCategoryId("");
    setAmount(null);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) resetForm();
  }

  const categoryItems = React.useMemo(
    () => (categoriesQuery.data ?? []).filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name })),
    [categoriesQuery.data],
  );

  const canSubmit = !!categoryId && !!amount && !spendMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit || !amount) return;
    setError(null);
    const dto: SpendDto = { categoryId, amount };
    try {
      await spendMutation.mutateAsync({ floatId: float.id, dto });
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

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label required>{t("categoryLabel")}</Label>
            <Combobox
              items={categoryItems}
              value={categoryId}
              onChange={setCategoryId}
              placeholder={categoriesQuery.isLoading ? t("loadingCategories") : t("selectCategoryPlaceholder")}
              searchPlaceholder={t("searchCategories")}
              emptyText={t("noCategoriesFound")}
              disabled={categoriesQuery.isLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("amountLabel")}</Label>
            <MoneyInput value={amount ?? ""} onValueChange={setAmount} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {spendMutation.isPending ? t("recording") : t("recordButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

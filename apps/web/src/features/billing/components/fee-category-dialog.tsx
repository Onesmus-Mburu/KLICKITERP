"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { FeeCategoryResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { useCreateFeeCategory, useUpdateFeeCategory } from "../hooks/use-fee-categories";
import { GlAccountSelect } from "./gl-account-select";

/**
 * Create/edit `bill_fee_category` dialog+form — the exact plain-controlled-
 * input `Dialog`/`useState` shape `class-dialog.tsx` established for small
 * (2-4 field) forms in this codebase, not `react-hook-form`. `UpdateFeeCategoryDto`
 * has no `isActive` field (confirmed by reading `fee-category.dto.ts`) — the
 * activate/deactivate toggle lives on the fee-categories page's row actions
 * instead, same split `class-dialog.tsx`/`DeleteClassButton` establish
 * between "edit fields" and "status action."
 */
export function FeeCategoryDialog({
  mode,
  category,
  open,
  onOpenChange,
}: {
  mode: "create" | "edit";
  category?: FeeCategoryResponseDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("billing.feeCategories.dialog");
  const tCommon = useTranslations("common");
  const [name, setName] = React.useState("");
  const [glIncomeAccountId, setGlIncomeAccountId] = React.useState("");
  const [taxable, setTaxable] = React.useState(false);
  const [priority, setPriority] = React.useState("0");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateFeeCategory();
  const updateMutation = useUpdateFeeCategory(category?.id ?? "");
  const pending = createMutation.isPending || updateMutation.isPending;

  React.useEffect(() => {
    if (open) {
      setName(category?.name ?? "");
      setGlIncomeAccountId(category?.glIncomeAccountId ?? "");
      setTaxable(category?.taxable ?? false);
      setPriority(category ? String(category.priority) : "0");
      setError(null);
    }
  }, [open, category]);

  async function handleSubmit() {
    setError(null);
    const parsedPriority = Number(priority);
    if (!name.trim()) {
      setError(t("nameRequired"));
      return;
    }
    if (!glIncomeAccountId.trim()) {
      setError(t("glAccountRequired"));
      return;
    }
    if (!Number.isFinite(parsedPriority) || parsedPriority < 0) {
      setError(t("priorityInvalid"));
      return;
    }
    try {
      if (mode === "create") {
        await createMutation.mutateAsync({ name, glIncomeAccountId, taxable, priority: parsedPriority });
      } else {
        await updateMutation.mutateAsync({ name, glIncomeAccountId, taxable, priority: parsedPriority });
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("titleCreate") : t("titleEdit")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("glAccount")}</Label>
            <GlAccountSelect value={glIncomeAccountId} onChange={setGlIncomeAccountId} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("priority")}</Label>
            <Input type="number" min={0} value={priority} onChange={(e) => setPriority(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} className="size-4 rounded border-input" />
            {t("taxable")}
          </label>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={pending}>
            {pending ? t("submitting") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

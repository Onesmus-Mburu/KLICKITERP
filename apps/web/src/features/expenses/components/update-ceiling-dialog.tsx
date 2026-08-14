"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/patterns/money-input";
import { formatMoney } from "@/lib/money";
import { ApiError } from "@/lib/api-error";
import { useUpdateFloatCeiling, type FloatResponseDto } from "../hooks/use-petty-cash";

/**
 * Phase 6 Slice 20 Part 2 (Petty Cash, Module 14) — a single-field ceiling
 * update. **Cannot go below the float's current `balance`** — server-enforced
 * (`PettyCashService.updateCeiling()`'s own real 422, "Cannot lower ceiling
 * below the float's current balance (balance=..., requested ceiling=...)")
 * and surfaced VERBATIM here (no client-side pre-check duplicating it), the
 * same "let the server's own message do the explaining" precedent
 * `create-float-dialog.tsx`'s own doc comment establishes for the
 * one-float-per-custodian conflict.
 */
export function UpdateCeilingDialog({ float }: { float: FloatResponseDto }) {
  const t = useTranslations("expenses.pettyCash.floats.updateCeilingDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [ceiling, setCeiling] = React.useState<string | null>(float.ceiling);
  const [error, setError] = React.useState<string | null>(null);

  const updateMutation = useUpdateFloatCeiling();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setCeiling(float.ceiling);
      setError(null);
    }
  }

  const canSubmit = !!ceiling && ceiling !== float.ceiling && !updateMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit || !ceiling) return;
    setError(null);
    try {
      await updateMutation.mutateAsync({ id: float.id, dto: { ceiling } });
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
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { balance: formatMoney(float.balance) })}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label required>{t("ceilingLabel")}</Label>
          <MoneyInput value={ceiling ?? ""} onValueChange={setCeiling} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {updateMutation.isPending ? t("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

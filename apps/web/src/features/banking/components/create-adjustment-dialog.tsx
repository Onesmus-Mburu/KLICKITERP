"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/patterns/money-input";
import { ApiError } from "@/lib/api-error";
import { useCreateAdjustment } from "../hooks/use-reconciliation";

const ADJUSTMENT_KINDS = ["CHARGE", "INTEREST"] as const;
type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Phase 6 Slice 21 Part 4 (Banking, Module 16) — `POST
 * .../reconciliations/{id}/adjustments`. P-33 (`CHARGE`) or its `INTEREST`
 * mirror, tied to exactly one `statementLineId` — realized server-side as a
 * real 2-line journal (debit `5100 Bank Charges Expense` / credit the bank
 * account's own GL account for `CHARGE`, the mirror for `INTEREST`) plus a
 * `bank_recon_match` row carrying `adjustmentJournalId` (never
 * `journalLineId` — this is a NEW entry, not a match against an existing
 * one), confirmed by reading `ReconciliationService.createAdjustment()`
 * directly.
 *
 * **`statementLineId` is a plain, manually-typed UUID field — a real,
 * confirmed workflow gap, not an oversight.** The in-progress reconciliation
 * screen (`<AutoMatchPanel>`) only ever learns a statement line's id from a
 * pass-3 SUGGESTION, and a suggestion by definition already has a candidate
 * journal-line match — the real-world case this dialog exists for (a bank
 * charge/interest line that was never booked in the ledger at all) produces
 * ZERO matches in every one of the 3 auto-match passes, since none of them
 * find a same-amount unreconciled journal line for it. That line's id is
 * therefore NEVER exposed by ANY endpoint while the reconciliation is
 * `IN_PROGRESS` (confirmed: no `bank_statement_line` browsing route exists
 * anywhere in this codebase — see `auto-match-panel.tsx`'s own doc comment),
 * and `lock()`'s own rich `outstanding.unmatchedStatementLines` snapshot
 * (the ONE place such a line's real id/date/amount/description would be
 * visible) only exists AFTER locking — but `createAdjustment()` REQUIRES
 * `status === "IN_PROGRESS"` and rejects a locked reconciliation with a real
 * 422. These two facts together mean: the intended flow (auto-match the
 * clean pairs, then adjust whatever's left) has no UI path to discover an
 * adjustment's own target line id through this API at all — the user must
 * already know it (e.g. from the bank statement file itself, or a direct
 * `psql` lookup). This is flagged honestly here and in this part's own
 * PROGRESS.md write-up, not routed around by inventing a fake picker.
 */
export function CreateAdjustmentDialog({ reconciliationId }: { reconciliationId: string }) {
  const t = useTranslations("banking.reconciliations.adjustmentDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [statementLineId, setStatementLineId] = React.useState("");
  const [kind, setKind] = React.useState<AdjustmentKind>("CHARGE");
  const [amount, setAmount] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateAdjustment();

  function resetForm() {
    setStatementLineId("");
    setKind("CHARGE");
    setAmount(null);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) resetForm();
  }

  const statementLineIdValid = UUID_PATTERN.test(statementLineId.trim());
  const canSubmit = statementLineIdValid && !!amount && !createMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit || !amount) return;
    setError(null);
    try {
      await createMutation.mutateAsync({
        id: reconciliationId,
        dto: { statementLineId: statementLineId.trim(), kind, amount },
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
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
            <Label required>{t("statementLineIdLabel")}</Label>
            <Input
              value={statementLineId}
              onChange={(e) => setStatementLineId(e.target.value)}
              placeholder={t("statementLineIdPlaceholder")}
            />
            {statementLineId.trim().length > 0 && !statementLineIdValid && (
              <p className="text-xs text-destructive">{t("statementLineIdInvalid")}</p>
            )}
            <p className="text-xs text-muted-foreground">{t("statementLineIdHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("kindLabel")}</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as AdjustmentKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADJUSTMENT_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`kind${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            {createMutation.isPending ? t("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Undo2 } from "lucide-react";
import type { JournalResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-error";
import { useReverseJournal } from "../hooks/use-journals";

/**
 * Phase 6 Slice 17 Part 2 (Journals, Module 7) — a confirm dialog asking for
 * the reversal narration, then `POST /accounting/journals/{id}/reverse`.
 * Mirrors `period-status-actions.tsx`'s own Hard-Close confirm-dialog shape
 * (a destructive-flavored, deliberate action behind one extra click), with a
 * required text field instead of a plain confirm — `ReverseJournalDto.narration`
 * is required, not optional, so the dialog can't be confirmed with it empty.
 *
 * The caller (`app/(erp)/accounting/journals/[id]/page.tsx`) is responsible
 * for only rendering this component when `useJournalReversal()` reports no
 * existing reversal yet — see that hook's own doc comment for why this is a
 * real, load-bearing client-side check (the server has no such guard).
 */
export function ReverseJournalDialog({ journal }: { journal: JournalResponseDto }) {
  const t = useTranslations("accounting.journals.reverseDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [narration, setNarration] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const reverseMutation = useReverseJournal();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setNarration("");
      setError(null);
    }
  }

  async function handleConfirm() {
    if (!narration.trim()) return;
    setError(null);
    try {
      await reverseMutation.mutateAsync({ id: journal.id, narration: narration.trim() });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Undo2 className="size-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { number: journal.number })}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label required>{t("narrationLabel")}</Label>
          <Textarea value={narration} onChange={(e) => setNarration(e.target.value)} placeholder={t("narrationPlaceholder")} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={() => void handleConfirm()} disabled={!narration.trim() || reverseMutation.isPending}>
            {reverseMutation.isPending ? t("reversing") : t("confirmButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

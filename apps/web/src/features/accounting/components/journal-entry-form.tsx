"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { PostJournalDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-error";
import { useCreateJournal } from "../hooks/use-journals";
import { emptyJournalLineRow, isJournalLineRowComplete, journalLineRowsToDto, journalLinesTotals, type JournalLineFormRow } from "../lib/journal-lines";
import { JournalLineEditor } from "./journal-line-editor";

const SOURCE_MODULE_MAX_LENGTH = 20; // gl_journal.source_module varchar(20) — post-journal.dto.ts's own @MaxLength(20).

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Phase 6 Slice 17 Part 2 (Journals, Module 7) — the manual journal entry
 * form, a dedicated PAGE component (not `create-journal-dialog.tsx` as the
 * plan's own file list first suggested) — a defensible, plan-acknowledged
 * deviation: the repeatable debit/credit line editor is a genuinely
 * multi-row, wide (6-column) table that reads far better with a full page's
 * width than cramped inside a `<Dialog>`'s max-width content area, the same
 * "dialog vs. dedicated page" call `bulk-generate-invoice-form.tsx` already
 * made for a similarly dynamic, multi-row form.
 *
 * **No `journalType` picker anywhere** — `PostJournalDto` has no such field;
 * the server force-sets every journal created through this one public POST
 * path to `"MANUAL"` (see `journals.api.ts`'s own doc comment).
 * **No period picker** — per the plan's own explicit suggestion, `periodId`
 * is omitted entirely from the request body and left for
 * `GlPeriodRepository.findCurrentForDate()` to resolve server-side from
 * `journalDate`; a period-closed rejection still surfaces verbatim via the
 * server's real 422 message if the resolved period isn't postable.
 *
 * Starts with 2 empty line rows (the practical minimum for a real journal,
 * even though `PostJournalDto.lines` itself only requires `.min(1)`) and an
 * "add line" button — per the plan's own UX guidance.
 */
export function JournalEntryForm() {
  const t = useTranslations("accounting.journals.create");
  const router = useRouter();
  const [journalDate, setJournalDate] = React.useState(todayIsoDate());
  const [sourceModule, setSourceModule] = React.useState("GL_MANUAL");
  const [narration, setNarration] = React.useState("");
  const [rows, setRows] = React.useState<JournalLineFormRow[]>(() => [emptyJournalLineRow(), emptyJournalLineRow()]);
  const [error, setError] = React.useState<string | null>(null);
  const createMutation = useCreateJournal();

  const totals = journalLinesTotals(rows);
  const linesComplete = rows.length >= 2 && rows.every(isJournalLineRowComplete);
  const canSubmit = !!journalDate && sourceModule.trim().length > 0 && narration.trim().length > 0 && linesComplete && totals.balanced && !createMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: PostJournalDto = {
      journalDate,
      sourceModule: sourceModule.trim(),
      narration: narration.trim(),
      lines: journalLineRowsToDto(rows),
    };
    try {
      const journal = await createMutation.mutateAsync(dto);
      router.push(`/accounting/journals/${journal.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("headerTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label required>{t("journalDateLabel")}</Label>
            <Input type="date" value={journalDate} onChange={(e) => setJournalDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("sourceModuleLabel")}</Label>
            <Input value={sourceModule} maxLength={SOURCE_MODULE_MAX_LENGTH} onChange={(e) => setSourceModule(e.target.value)} placeholder={t("sourceModulePlaceholder")} />
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label required>{t("narrationLabel")}</Label>
            <Textarea value={narration} onChange={(e) => setNarration(e.target.value)} placeholder={t("narrationPlaceholder")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("linesTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <JournalLineEditor rows={rows} onChange={setRows} />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.push("/accounting/journals")}>
          {t("cancel")}
        </Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
          {createMutation.isPending ? t("submitting") : t("submitButton")}
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Phase 6 Slice 21 Part 3 (Statement Import, Module 16) — the post-import
 * result panel, shown once `POST /banking/statement-imports` genuinely
 * returns a `201`. **BR-BANK-02 dedupe is surfaced HONESTLY here, per the
 * task brief's own explicit instruction**: a re-import of overlapping rows
 * is a completely NORMAL, successful outcome (`duplicateCount > 0` is not an
 * error or a partial-failure state — `statement-import.api.ts`'s own doc
 * comment confirms `insertedCount + duplicateCount === rawRows.length`
 * always), so this panel always renders with the SAME neutral/positive
 * treatment (a `success`-tinted `<Alert>`, a checkmark icon) regardless of
 * how large `duplicateCount` is — never `warning`/`destructive`, and never a
 * conditional "if duplicates > 0, show a caution banner" branch. The two
 * counts are stated together in one plain sentence (`"12 lines imported, 3
 * duplicates skipped"`-shaped copy, `banking.statementImports.dedupeSummary`)
 * — the exact phrasing the task brief itself suggested — rather than a
 * table/chart that would overstate the significance of a routine, expected
 * outcome.
 */
export function ImportResultSummary({ insertedCount, duplicateCount }: { insertedCount: number; duplicateCount: number }) {
  const t = useTranslations("banking.statementImports");

  return (
    <Alert variant="success">
      <CheckCircle2 />
      <AlertDescription className="space-y-1">
        <p className="font-medium text-foreground">{t("new.result.title")}</p>
        <p>{t("dedupeSummary", { inserted: insertedCount, duplicates: duplicateCount })}</p>
        {duplicateCount > 0 && <p className="text-xs">{t("new.result.duplicateExplainer")}</p>}
      </AlertDescription>
    </Alert>
  );
}

"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { IntegrityRunResponseDto } from "@klickit/contracts";
import { RunSweepButton } from "@/features/accounting/components/run-sweep-button";
import { IntegrityRunList } from "@/features/accounting/components/integrity-run-list";

/**
 * Phase 6 Slice 17 Part 4 (Integrity Sweep, Module 7 — the FINAL part of this
 * slice) — run button up top, run history below. `highlightRunId` is set
 * whenever a completed run is NOT clean (`!run.ok`, equivalent to
 * `findings.mismatchCount > 0` — see `IntegritySweepService.runSweep()`'s
 * own `ok: mismatches.length === 0`), so `<IntegrityRunList>` auto-expands
 * and scrolls to that fresh run's findings — a clean run instead shows its
 * own inline confirmation directly under the button
 * (`<RunSweepButton>`'s own `success` alert), with nothing further to
 * navigate to.
 */
export default function IntegritySweepPage() {
  const t = useTranslations("accounting.integritySweep.page");
  const [highlightRunId, setHighlightRunId] = React.useState<string | null>(null);

  function handleCompleted(run: IntegrityRunResponseDto) {
    if (!run.ok) setHighlightRunId(run.id);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
      </div>

      <RunSweepButton onCompleted={handleCompleted} />

      <IntegrityRunList highlightRunId={highlightRunId} />
    </div>
  );
}

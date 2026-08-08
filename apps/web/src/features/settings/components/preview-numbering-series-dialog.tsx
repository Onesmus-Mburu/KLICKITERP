"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Eye } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { usePreviewNumberingSeries } from "../hooks/use-numbering-series";
import type { NumberingPreviewResponse, NumberingSeriesResponse } from "../types";

const DEFAULT_COUNT = 3;

/**
 * Phase 6 Slice 11 Part 1 — `GET /numbering-series/:id/preview?count=`'s
 * first frontend caller. Manual "Run preview" step (not auto-run on open),
 * same attempt-then-reveal shape `<TestConnectionDialog>` already
 * establishes. This is genuinely read-only server-side — `NumberingService.
 * previewNext()` computes the preview from `nextNo` without writing
 * anything (confirmed by reading it directly: no repository `save()` call
 * at all) — so reopening/re-running this dialog freely is always safe.
 */
export function PreviewNumberingSeriesDialog({ series }: { series: NumberingSeriesResponse }) {
  const t = useTranslations("settings.numberingSeries");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [count, setCount] = React.useState(DEFAULT_COUNT);
  const [result, setResult] = React.useState<NumberingPreviewResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const previewMutation = usePreviewNumberingSeries();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setCount(DEFAULT_COUNT);
      setResult(null);
      setError(null);
    }
  }

  async function handleRun() {
    setError(null);
    setResult(null);
    try {
      setResult(await previewMutation.mutateAsync({ id: series.id, count }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Eye className="size-4" />
          {t("previewTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("previewTitle", { docType: series.docType, seriesCode: series.seriesCode })}</DialogTitle>
          <DialogDescription>{t("previewDescription")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label>{t("countLabel")}</Label>
          <Input
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(e) => setCount(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
          />
        </div>

        {result && (
          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-medium text-foreground">{t("resultTitle")}</p>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-sm">
              {result.next.map((n) => (
                <li key={n} className="font-mono">
                  {n}
                </li>
              ))}
            </ol>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("close")}
          </Button>
          <Button type="button" onClick={() => void handleRun()} disabled={previewMutation.isPending}>
            {previewMutation.isPending ? t("previewing") : t("runPreview")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { useCreateAcademicYear, useCreateTerm } from "../hooks/use-academic-calendar";

const NAME_MAX_LENGTH = 20; // set_academic_year.name / set_term.name are both varchar(20) — see migration 0030.

interface TermDraft {
  key: string;
  name: string;
  startsOn: string;
  endsOn: string;
}

function newTermDraft(seq: number): TermDraft {
  return { key: `term-${seq}-${Date.now()}`, name: `Term ${seq}`, startsOn: "", endsOn: "" };
}

type StepResult = { kind: "idle" } | { kind: "yearFailed"; message: string } | { kind: "done"; termResults: { name: string; ok: boolean; message?: string }[] };

/**
 * Phase 6 Slice 3b — a real Academic Year + Terms creation wizard: create the
 * year, then create N terms sequentially, each with its own name/start/end
 * date, in one composed flow — using the existing real
 * `POST /academic-years`/`POST /terms` endpoints (no new backend endpoint).
 *
 * **Partial-failure handling, explicit per the plan**: if year creation
 * succeeds but a term fails partway through, the remaining terms are still
 * attempted (one term's failure — e.g. a duplicate `seq` for that year —
 * shouldn't block the others), and the dialog ends in a real per-term
 * succeeded/failed report rather than a generic error, so the user knows
 * exactly what exists in the database afterward and what still needs
 * fixing. If the YEAR itself fails to create, no term calls are attempted at
 * all (there is nothing to attach them to yet) and the dialog shows that
 * error plainly.
 */
export function AcademicYearWizardDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("billing.academicYearWizard");
  const tCommon = useTranslations("common");
  const createYearMutation = useCreateAcademicYear();
  const createTermMutation = useCreateTerm();

  const [yearName, setYearName] = React.useState("");
  const [yearStartsOn, setYearStartsOn] = React.useState("");
  const [yearEndsOn, setYearEndsOn] = React.useState("");
  const [terms, setTerms] = React.useState<TermDraft[]>([newTermDraft(1)]);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<StepResult>({ kind: "idle" });

  React.useEffect(() => {
    if (open) {
      setYearName("");
      setYearStartsOn("");
      setYearEndsOn("");
      setTerms([newTermDraft(1)]);
      setError(null);
      setResult({ kind: "idle" });
    }
  }, [open]);

  function updateTerm(key: string, changes: Partial<TermDraft>) {
    setTerms((prev) => prev.map((term) => (term.key === key ? { ...term, ...changes } : term)));
  }

  function addTerm() {
    setTerms((prev) => [...prev, newTermDraft(prev.length + 1)]);
  }

  function removeTerm(key: string) {
    setTerms((prev) => prev.filter((term) => term.key !== key));
  }

  async function handleSubmit() {
    setError(null);
    setResult({ kind: "idle" });

    if (!yearName.trim() || !yearStartsOn || !yearEndsOn) {
      setError(t("yearFieldsRequired"));
      return;
    }
    if (yearStartsOn >= yearEndsOn) {
      setError(t("yearDatesInvalid"));
      return;
    }
    if (terms.length === 0) {
      setError(t("atLeastOneTermRequired"));
      return;
    }
    for (const term of terms) {
      if (!term.name.trim() || !term.startsOn || !term.endsOn) {
        setError(t("termFieldsRequired"));
        return;
      }
      if (term.startsOn >= term.endsOn) {
        setError(t("termDatesInvalid", { name: term.name }));
        return;
      }
    }

    setSubmitting(true);

    let createdYear;
    try {
      createdYear = await createYearMutation.mutateAsync({ name: yearName.trim(), startsOn: yearStartsOn, endsOn: yearEndsOn });
    } catch (err) {
      setSubmitting(false);
      setResult({ kind: "yearFailed", message: err instanceof ApiError ? err.message : t("genericError") });
      return;
    }

    // Year created — now attempt every term, sequentially, tolerating individual failures so one
    // bad term (e.g. a duplicate seq) doesn't block the rest from being created.
    const termResults: { name: string; ok: boolean; message?: string }[] = [];
    for (const [index, term] of terms.entries()) {
      try {
        await createTermMutation.mutateAsync({
          academicYearId: createdYear.id,
          name: term.name.trim(),
          seq: index + 1,
          startsOn: term.startsOn,
          endsOn: term.endsOn,
        });
        termResults.push({ name: term.name, ok: true });
      } catch (err) {
        termResults.push({ name: term.name, ok: false, message: err instanceof ApiError ? err.message : t("genericError") });
      }
    }

    setSubmitting(false);
    setResult({ kind: "done", termResults });
  }

  const allTermsSucceeded = result.kind === "done" && result.termResults.every((r) => r.ok);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result.kind === "yearFailed" && (
          <Alert variant="destructive">
            <AlertDescription>{t("yearFailed", { message: result.message })}</AlertDescription>
          </Alert>
        )}

        {result.kind === "done" && (
          <Alert variant={allTermsSucceeded ? "default" : "warning"}>
            <AlertDescription>
              <p>{t("yearCreated", { name: yearName })}</p>
              <ul className="mt-1 list-inside list-disc">
                {result.termResults.map((r) => (
                  <li key={r.name}>
                    {r.ok ? t("termCreated", { name: r.name }) : t("termFailed", { name: r.name, message: r.message ?? "" })}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-sm font-medium text-foreground">{t("yearSectionTitle")}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-1">
                <Label required>{t("yearName")}</Label>
                <Input value={yearName} maxLength={NAME_MAX_LENGTH} onChange={(e) => setYearName(e.target.value)} placeholder={t("yearNamePlaceholder")} />
              </div>
              <div className="space-y-1.5">
                <Label required>{t("startsOn")}</Label>
                <Input type="date" value={yearStartsOn} onChange={(e) => setYearStartsOn(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label required>{t("endsOn")}</Label>
                <Input type="date" value={yearEndsOn} onChange={(e) => setYearEndsOn(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{t("termsSectionTitle")}</p>
              <Button type="button" size="sm" variant="outline" onClick={addTerm}>
                <Plus className="size-4" />
                {t("addTerm")}
              </Button>
            </div>
            {terms.map((term, index) => (
              <div key={term.key} className="grid grid-cols-1 items-end gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <div className="space-y-1.5">
                  <Label required>{t("termName", { seq: index + 1 })}</Label>
                  <Input value={term.name} maxLength={NAME_MAX_LENGTH} onChange={(e) => updateTerm(term.key, { name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label required>{t("startsOn")}</Label>
                  <Input type="date" value={term.startsOn} onChange={(e) => updateTerm(term.key, { startsOn: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label required>{t("endsOn")}</Label>
                  <Input type="date" value={term.endsOn} onChange={(e) => updateTerm(term.key, { endsOn: e.target.value })} />
                </div>
                <Button type="button" size="icon" variant="ghost" className="text-destructive" disabled={terms.length === 1} onClick={() => removeTerm(term.key)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {result.kind === "done" ? tCommon("close") : tCommon("cancel")}
          </Button>
          {result.kind !== "done" && (
            <Button type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting ? t("submitting") : t("submit")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

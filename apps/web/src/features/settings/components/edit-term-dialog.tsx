"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
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
import type { UpdateTermDto } from "@klickit/contracts";
import { ApiError } from "@/lib/api-error";
import { useUpdateTerm } from "../hooks/use-academic-calendar";
import type { TermResponse } from "../types";

const NAME_MAX_LENGTH = 20; // set_term.name is varchar(20), same limit as set_academic_year.name — migration 0030.

/**
 * Phase 6 Slice 11 Part 1 — the first "edit an existing term" capability
 * anywhere in this app. Per the plan's own explicit instruction: fields are
 * NEVER client-side disabled based on `term.billingLocked` (lock state can
 * change from elsewhere between this dialog opening and the user hitting
 * Save, so a stale client-side disable would be actively misleading) — the
 * real 422 from `AcademicCalendarService.updateTerm()` is instead caught and
 * shown plainly, exactly as the server reports it.
 *
 * **Diff-based submit is load-bearing here, not just tidy**: the backend
 * rejects a billing-locked term's update whenever `seq`/`startsOn`/`endsOn`
 * is PRESENT in the PATCH body at all (`changes[field] !== undefined`,
 * confirmed by reading `AcademicCalendarService.updateTerm()` directly) —
 * it does NOT check whether the value actually differs from what's already
 * stored. Always resending all 4 fields (the simpler-looking option) would
 * make editing just the `name` of a locked term impossible, contradicting
 * the plan's own explicit requirement that "editing just its name still
 * succeeds while locked." So this dialog sends ONLY the fields the user
 * actually changed.
 */
export function EditTermDialog({ term }: { term: TermResponse }) {
  const t = useTranslations("settings.academicCalendar");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(term.name);
  const [seq, setSeq] = React.useState(term.seq);
  const [startsOn, setStartsOn] = React.useState(term.startsOn);
  const [endsOn, setEndsOn] = React.useState(term.endsOn);
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateTerm();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName(term.name);
      setSeq(term.seq);
      setStartsOn(term.startsOn);
      setEndsOn(term.endsOn);
      setError(null);
    }
  }

  const canSubmit = name.trim().length > 0 && seq >= 1 && !!startsOn && !!endsOn;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: UpdateTermDto = {};
    if (name.trim() !== term.name) dto.name = name.trim();
    if (seq !== term.seq) dto.seq = seq;
    if (startsOn !== term.startsOn) dto.startsOn = startsOn;
    if (endsOn !== term.endsOn) dto.endsOn = endsOn;
    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: term.id, dto });
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
          {tCommon("edit")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editTermTitle", { name: term.name })}</DialogTitle>
          <DialogDescription>{t("editTermDescription")}</DialogDescription>
        </DialogHeader>

        {term.billingLocked && (
          <Alert variant="warning">
            <AlertDescription>{t("termLockedHint")}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label required>{t("termNameLabel")}</Label>
            <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("seq")}</Label>
            <Input type="number" min={1} value={seq} onChange={(e) => setSeq(Math.max(1, Number(e.target.value) || 1))} />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("startsOn")}</Label>
            <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("endsOn")}</Label>
            <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || updateMutation.isPending}>
            {updateMutation.isPending ? t("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

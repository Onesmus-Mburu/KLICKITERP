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
import type { UpdateAcademicYearDto } from "@klickit/contracts";
import { ApiError } from "@/lib/api-error";
import { useUpdateAcademicYear } from "../hooks/use-academic-calendar";
import type { AcademicYearResponse } from "../types";

const NAME_MAX_LENGTH = 20; // set_academic_year.name is varchar(20) — see migration 0030, same limit academic-year-wizard-dialog.tsx already documents.

/**
 * Phase 6 Slice 11 Part 1 — the first "edit an existing academic year"
 * capability anywhere in this app (the wizard only ever creates). Diff-based
 * submit: only fields the user actually changed are sent in the `PATCH`
 * body — `UpdateAcademicYearDto` has no lock concept (only terms do), so
 * this isn't strictly required for correctness here the way it is for
 * `<EditTermDialog>`, but it's kept consistent with that dialog's own
 * "send only what changed" shape rather than always resending all 3 fields.
 */
export function EditAcademicYearDialog({ year }: { year: AcademicYearResponse }) {
  const t = useTranslations("settings.academicCalendar");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(year.name);
  const [startsOn, setStartsOn] = React.useState(year.startsOn);
  const [endsOn, setEndsOn] = React.useState(year.endsOn);
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateAcademicYear();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName(year.name);
      setStartsOn(year.startsOn);
      setEndsOn(year.endsOn);
      setError(null);
    }
  }

  const canSubmit = name.trim().length > 0 && !!startsOn && !!endsOn;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: UpdateAcademicYearDto = {};
    if (name.trim() !== year.name) dto.name = name.trim();
    if (startsOn !== year.startsOn) dto.startsOn = startsOn;
    if (endsOn !== year.endsOn) dto.endsOn = endsOn;
    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: year.id, dto });
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
          <DialogTitle>{t("editYearTitle", { name: year.name })}</DialogTitle>
          <DialogDescription>{t("editYearDescription")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-1">
            <Label required>{t("yearName")}</Label>
            <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} />
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

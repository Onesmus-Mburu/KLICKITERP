"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import type { PyrlSalaryStructureResponseDto, UpdatePyrlSalaryStructureDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useUpdateSalaryStructure } from "../hooks/use-salary-structures";

const NAME_MAX_LENGTH = 120;
const GRADE_MAX_LENGTH = 30;

/**
 * Phase 6 Slice 22 Part 2 (Payroll, Module 15) — unlike Part 1's
 * Components/Employees edit dialogs, `UpdatePyrlSalaryStructureDto` allows
 * `name?`/`grade?`/`effectiveFrom?` ALL editable, nothing create-only or
 * immutable (confirmed by reading `salary-structure.dto.ts` directly) — so
 * this form carries every field the create dialog does, no "permanent once
 * created" warning to repeat.
 *
 * `effectiveFromHint` repeats the same "purely descriptive, not
 * time-versioned" note `create-salary-structure-dialog.tsx` shows — editing
 * this date after the fact still changes nothing about real payroll-time
 * amount resolution.
 */
export function EditSalaryStructureDialog({ structure }: { structure: PyrlSalaryStructureResponseDto }) {
  const t = useTranslations("payroll.salaryStructures.editDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(structure.name);
  const [grade, setGrade] = React.useState(structure.grade ?? "");
  const [effectiveFrom, setEffectiveFrom] = React.useState(structure.effectiveFrom);
  const [error, setError] = React.useState<string | null>(null);

  const updateMutation = useUpdateSalaryStructure();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName(structure.name);
      setGrade(structure.grade ?? "");
      setEffectiveFrom(structure.effectiveFrom);
      setError(null);
    }
  }

  const canSubmit = name.trim().length > 0 && !!effectiveFrom;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: UpdatePyrlSalaryStructureDto = {};
    if (name.trim() !== structure.name) dto.name = name.trim();
    if (grade.trim() !== (structure.grade ?? "")) dto.grade = grade.trim();
    if (effectiveFrom !== structure.effectiveFrom) dto.effectiveFrom = effectiveFrom;

    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: structure.id, dto });
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
          <DialogTitle>{t("title", { name: structure.name })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("nameLabel")}</Label>
            <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("gradeLabel")}</Label>
              <Input value={grade} maxLength={GRADE_MAX_LENGTH} onChange={(e) => setGrade(e.target.value)} placeholder={t("gradePlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("effectiveFromLabel")}</Label>
              <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("effectiveFromHint")}</p>
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

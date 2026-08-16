"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreatePyrlSalaryStructureDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useCreateSalaryStructure } from "../hooks/use-salary-structures";

const NAME_MAX_LENGTH = 120; // pyrl_salary_structure.name — salary-structure.dto.ts's own @MaxLength(120).
const GRADE_MAX_LENGTH = 30; // pyrl_salary_structure.grade — @MaxLength(30).

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

/**
 * Phase 6 Slice 22 Part 2 (Payroll, Module 15) — the salary structure create
 * form: `name` (required) + `grade` (optional, free text — e.g. "Grade 5",
 * no fixed enum anywhere server-side, confirmed by reading
 * `CreatePyrlSalaryStructureDto` directly, plain `@IsString()` +
 * `@MaxLength(30)`) + `effectiveFrom` (required date, defaulted to today).
 *
 * **`effectiveFrom` is purely descriptive metadata — it plays NO role in any
 * real time-versioned lookup anywhere in this system**, per this part's own
 * task brief: the real time-boundary that matters at payroll-compute time
 * lives on `pyrl_employee_assignment.effectiveFrom/To` (Part 3, not built
 * yet), not here. `effectiveFromHint` below states this plainly right next
 * to the input, so a user doesn't assume setting this date does something it
 * doesn't.
 *
 * **All 3 fields generate cleanly with no request-body cast** — see
 * `salary-structures.api.ts`'s own doc comment for the direct verification
 * against `openapi-types.ts`/the zod-inferred schema, a real, different-
 * shaped finding from Part 1's own Components/Employees DTOs.
 *
 * **Duplicate `name` now gets a real 409** — this part's own opportunistic
 * backend fix (`SalaryStructuresService.create()`), surfaced verbatim via
 * `ApiError.message`, same shape as `create-component-dialog.tsx`'s own
 * `code`-uniqueness precedent from Part 1.
 */
export function CreateSalaryStructureDialog() {
  const t = useTranslations("payroll.salaryStructures.createDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [grade, setGrade] = React.useState("");
  const [effectiveFrom, setEffectiveFrom] = React.useState(todayIsoDate());
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateSalaryStructure();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName("");
      setGrade("");
      setEffectiveFrom(todayIsoDate());
      setError(null);
    }
  }

  const canSubmit = name.trim().length > 0 && !!effectiveFrom;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: CreatePyrlSalaryStructureDto = {
      name: name.trim(),
      effectiveFrom,
    };
    if (grade.trim()) dto.grade = grade.trim();
    try {
      await createMutation.mutateAsync(dto);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="size-4" />
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

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("nameLabel")}</Label>
            <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
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
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? t("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

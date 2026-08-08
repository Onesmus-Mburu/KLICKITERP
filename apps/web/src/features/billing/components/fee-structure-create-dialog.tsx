"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, MultiSelect } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { useClasses } from "@/features/students/hooks/use-classes";
import { useStreamsForClass } from "@/features/students/hooks/use-streams";
import { useFeeGroups } from "@/features/students/hooks/use-fee-groups";
import { useAcademicYears, findCurrent } from "../hooks/use-academic-calendar";
import { useCreateFeeStructure } from "../hooks/use-fee-structures";

const NO_FEE_GROUP_VALUE = "__none__";
const ANY_BOARDING_VALUE = "__any__";
const NO_STREAM_VALUE = "__any__";
const BOARDING_KINDS = ["DAY", "BOARDER"] as const;

/**
 * Create-DRAFT dialog for a fee structure — Phase 6 Slice 3b (Fee Structure
 * Redesign): a structure now spans a whole ACADEMIC YEAR (`termId` dropped
 * from `CreateFeeStructureDto` entirely — term now lives on each LINE, added
 * via `<FeeStructureLineForm>` one layer up on the detail page), so this
 * dialog's scope picker drops the term selector and gains a real
 * multi-grade (multi-class) picker instead: selecting N classes creates N
 * separate DRAFT structures (one `POST /billing/fee-structures` call per
 * class, via `createDraft()`'s own per-scope versioning — each class is a
 * genuinely distinct scope), reported back with a real per-class
 * succeeded/failed summary rather than silently only handling the
 * all-succeed case.
 *
 * `streamId` only applies when EXACTLY ONE class is selected — a stream
 * belongs to one specific class (`useStreamsForClass(classId)`), so there is
 * no coherent single "stream" selection across multiple different classes;
 * the stream picker is disabled with an explanatory hint once more than one
 * class is chosen (its value is also cleared, not silently sent for the
 * wrong class).
 */
export function FeeStructureCreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("billing.feeStructures.createDialog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const classesQuery = useClasses();
  const yearsQuery = useAcademicYears();
  const feeGroupsQuery = useFeeGroups();
  const createMutation = useCreateFeeStructure();

  const [academicYearId, setAcademicYearId] = React.useState<string | null>(null);
  const [classIds, setClassIds] = React.useState<string[]>([]);
  const [streamId, setStreamId] = React.useState<string | null>(null);
  const [boarding, setBoarding] = React.useState<string | null>(null);
  const [feeGroupId, setFeeGroupId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [partialResult, setPartialResult] = React.useState<{ succeeded: string[]; failed: { name: string; message: string }[] } | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const singleClassId = classIds.length === 1 ? classIds[0] : undefined;
  const streamsQuery = useStreamsForClass(singleClassId);

  React.useEffect(() => {
    if (open) {
      setAcademicYearId(null);
      setClassIds([]);
      setStreamId(null);
      setBoarding(null);
      setFeeGroupId(null);
      setError(null);
      setPartialResult(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (!academicYearId && yearsQuery.data) {
      const current = findCurrent(yearsQuery.data);
      if (current) setAcademicYearId(current.id);
    }
  }, [academicYearId, yearsQuery.data]);

  // A stream selection only makes sense while exactly one class is chosen — clear it otherwise.
  React.useEffect(() => {
    if (classIds.length !== 1) setStreamId(null);
  }, [classIds]);

  const classOptions = React.useMemo(
    () => (classesQuery.data ?? []).map((klass) => ({ value: klass.id, label: klass.name })),
    [classesQuery.data],
  );
  const classNameById = React.useMemo(() => new Map((classesQuery.data ?? []).map((k) => [k.id, k.name])), [classesQuery.data]);

  async function handleSubmit() {
    setError(null);
    setPartialResult(null);
    if (!academicYearId) {
      setError(t("yearRequired"));
      return;
    }
    if (classIds.length === 0) {
      setError(t("classRequired"));
      return;
    }

    setSubmitting(true);
    const succeeded: string[] = [];
    const failed: { name: string; message: string }[] = [];
    let lastCreatedId: string | null = null;

    for (const classId of classIds) {
      try {
        const created = await createMutation.mutateAsync({
          academicYearId,
          classId,
          streamId: classIds.length === 1 ? (streamId ?? undefined) : undefined,
          boarding: (boarding as "DAY" | "BOARDER" | null) ?? undefined,
          feeGroupId: feeGroupId ?? undefined,
        });
        succeeded.push(classId);
        lastCreatedId = created.id;
      } catch (err) {
        failed.push({
          name: classNameById.get(classId) ?? classId,
          message: err instanceof ApiError ? err.message : t("genericError"),
        });
      }
    }
    setSubmitting(false);

    if (failed.length === 0 && succeeded.length === 1 && lastCreatedId) {
      // Exactly one structure created, none failed — same single-structure UX as before this
      // slice's multi-grade addition: close and jump straight to its detail page.
      onOpenChange(false);
      router.push(`/billing/fee-structures/${lastCreatedId}`);
      return;
    }

    if (failed.length === 0) {
      // Multiple structures created, all succeeded — close; the list query invalidation already
      // fired per-class inside useCreateFeeStructure's onSuccess.
      onOpenChange(false);
      return;
    }

    // At least one class failed — tell the user exactly what succeeded/failed, don't leave them
    // guessing, and keep the dialog open so they can retry the failed ones only.
    setPartialResult({ succeeded: succeeded.map((id) => classNameById.get(id) ?? id), failed });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

        {partialResult && (
          <Alert variant={partialResult.succeeded.length > 0 ? "warning" : "destructive"}>
            <AlertDescription>
              <p>
                {partialResult.succeeded.length > 0
                  ? t("partial.succeeded", { classes: partialResult.succeeded.join(", ") })
                  : t("partial.noneSucceeded")}
              </p>
              <ul className="mt-1 list-inside list-disc">
                {partialResult.failed.map((f) => (
                  <li key={f.name}>
                    {f.name}: {f.message}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("academicYear")}</Label>
            <Select value={academicYearId ?? ""} onValueChange={setAcademicYearId} disabled={yearsQuery.isLoading}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectYear")} />
              </SelectTrigger>
              <SelectContent>
                {yearsQuery.data?.map((year) => (
                  <SelectItem key={year.id} value={year.id}>
                    {year.name}
                    {year.isCurrent ? " *" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label required>{t("grades")}</Label>
            <MultiSelect
              options={classOptions}
              selected={classIds}
              onChange={setClassIds}
              placeholder={t("selectGrades")}
              disabled={classesQuery.isLoading}
            />
            <p className="text-xs text-muted-foreground">{t("gradesHint")}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t("stream")}</Label>
              <Select
                value={streamId ?? NO_STREAM_VALUE}
                onValueChange={(v) => setStreamId(v === NO_STREAM_VALUE ? null : v)}
                disabled={classIds.length !== 1 || streamsQuery.isLoading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_STREAM_VALUE}>{t("anyStream")}</SelectItem>
                  {streamsQuery.data?.map((stream) => (
                    <SelectItem key={stream.id} value={stream.id}>
                      {stream.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {classIds.length > 1 && <p className="text-xs text-muted-foreground">{t("streamDisabledHint")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>{t("boarding")}</Label>
              <Select value={boarding ?? ANY_BOARDING_VALUE} onValueChange={(v) => setBoarding(v === ANY_BOARDING_VALUE ? null : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_BOARDING_VALUE}>{t("anyBoarding")}</SelectItem>
                  {BOARDING_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {t(`boardingKind.${kind}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("feeGroup")}</Label>
              <Select value={feeGroupId ?? NO_FEE_GROUP_VALUE} onValueChange={(v) => setFeeGroupId(v === NO_FEE_GROUP_VALUE ? null : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FEE_GROUP_VALUE}>{t("anyFeeGroup")}</SelectItem>
                  {feeGroupsQuery.data?.map((fg) => (
                    <SelectItem key={fg.id} value={fg.id}>
                      {fg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? t("submitting") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

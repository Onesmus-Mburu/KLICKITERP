"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { StudentResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError, parseFieldErrors } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { useStudentSearch } from "../hooks/use-students";
import { useLinkStudentToGuardian } from "../hooks/use-guardians";

/** Same frontend convention list `guardian-fields.tsx`/`guardian-link-dialog.tsx` already establish for `relationship` — restated here since this is a separate small control on the guardian side, not worth extracting a whole shared component for. */
const RELATIONSHIP_CODES = ["FATHER", "MOTHER", "GUARDIAN", "SPONSOR"] as const;

/**
 * The reverse of `guardian-link-dialog.tsx`: from a guardian's own detail
 * page, search for and link an EXISTING student (guardianId is fixed here,
 * studentId varies — the opposite of that dialog's shape). Uses the real
 * server-side `useStudentSearch()` (`GET /students/search`, `ILIKE`-backed)
 * rather than a client-side filter over a bulk list, since `GET /students`
 * is genuinely paginated (confirmed by reading `listStudents()` directly) —
 * unlike the guardian-search side, there's no safe unpaginated bulk fetch to
 * filter client-side here.
 */
export function LinkStudentDialog({ guardianId, open, onOpenChange }: { guardianId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("students.guardiansPage.linkStudentDialog");
  const tCommon = useTranslations("common");
  const [search, setSearch] = React.useState("");
  const [selectedStudent, setSelectedStudent] = React.useState<StudentResponseDto | null>(null);
  const [relationship, setRelationship] = React.useState("");
  const [isPrimary, setIsPrimary] = React.useState(false);
  const [receivesBilling, setReceivesBilling] = React.useState(true);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  const searchQuery = useStudentSearch(search, 10);
  const linkMutation = useLinkStudentToGuardian(guardianId);

  React.useEffect(() => {
    if (!open) {
      setSearch("");
      setSelectedStudent(null);
      setRelationship("");
      setIsPrimary(false);
      setReceivesBilling(true);
      setFieldErrors({});
      setFormError(null);
    }
  }, [open]);

  async function handleSubmit() {
    setFormError(null);
    setFieldErrors({});
    if (!selectedStudent) {
      setFormError(t("selectStudentFirst"));
      return;
    }
    if (!relationship.trim()) {
      setFieldErrors({ relationship: t("relationshipRequired") });
      return;
    }
    try {
      await linkMutation.mutateAsync({ studentId: selectedStudent.id, relationship, isPrimary, receivesBilling });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        const parsed = parseFieldErrors(err);
        if (Object.keys(parsed).length > 0) {
          setFieldErrors(parsed);
          return;
        }
      }
      setFormError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <Input placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
            {search.trim().length === 0 && <p className="p-3 text-xs text-muted-foreground">{t("typeToSearch")}</p>}
            {search.trim().length > 0 &&
              (searchQuery.data ?? []).map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => setSelectedStudent(s)}
                  className={cn(
                    "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted",
                    selectedStudent?.id === s.id && "bg-tint-primary",
                  )}
                >
                  <span className="font-medium text-foreground">
                    {s.firstName} {s.lastName}
                  </span>
                  <span className="text-xs text-muted-foreground">{s.admissionNo}</span>
                </button>
              ))}
            {search.trim().length > 0 && searchQuery.data?.length === 0 && <p className="p-3 text-xs text-muted-foreground">{t("noResults")}</p>}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label required>{t("relationship")}</Label>
              <Select value={relationship} onValueChange={setRelationship}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectRelationship")} />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_CODES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {t(`relationshipOptions.${code}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.relationship && <p className="text-xs text-destructive">{fieldErrors.relationship}</p>}
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} className="size-4 rounded border-input" />
              {t("isPrimary")}
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={receivesBilling} onChange={(e) => setReceivesBilling(e.target.checked)} className="size-4 rounded border-input" />
              {t("receivesBilling")}
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={linkMutation.isPending}>
            {linkMutation.isPending ? t("submitting") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

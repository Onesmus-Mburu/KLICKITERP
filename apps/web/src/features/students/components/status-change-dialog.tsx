"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { StudentResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { STUDENT_EXIT_STATUSES, STUDENT_STATUSES, type StudentStatus } from "../constants";
import { useChangeStudentStatus } from "../hooks/use-students";

/**
 * Exit-status `<SelectItem>`s (`ALUMNI`/`TRANSFERRED`/`WITHDRAWN`) are
 * disabled until `student.exitCleared` — mirrors `StudentsService
 * .changeStatus()`'s real rejection (`ValidationException`: "cannot move to
 * X — exit_cleared must be true first") so the UI never lets a user submit a
 * transition the server would reject anyway. Once the student is ALREADY in
 * an exit status, every exit item stays enabled (moving between exit
 * statuses, or back to ACTIVE/SUSPENDED, isn't gated — only the FIRST
 * transition INTO an exit status is, per `STD_STUDENT_EXIT_STATUSES`'
 * `wasAlreadyExited` check in the real service).
 */
export function StatusChangeDialog({ student }: { student: StudentResponseDto }) {
  const t = useTranslations("students.statusDialog");
  const tStatus = useTranslations("students.status");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState<StudentStatus>(student.status as StudentStatus);
  const [error, setError] = React.useState<string | null>(null);
  const mutation = useChangeStudentStatus(student.id);

  React.useEffect(() => {
    if (open) {
      setStatus(student.status as StudentStatus);
      setError(null);
    }
  }, [open, student.status]);

  const wasAlreadyExited = STUDENT_EXIT_STATUSES.includes(student.status as StudentStatus);
  const exitLocked = !student.exitCleared && !wasAlreadyExited;

  async function handleSubmit() {
    setError(null);
    try {
      await mutation.mutateAsync({ status });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{t("trigger")}</Button>
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

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {t("currentStatus")}: <span className="font-medium text-foreground">{tStatus(student.status)}</span>
          </p>
          <Select value={status} onValueChange={(v) => setStatus(v as StudentStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STUDENT_STATUSES.map((s) => {
                const disabled = STUDENT_EXIT_STATUSES.includes(s) && exitLocked;
                return (
                  <SelectItem key={s} value={s} disabled={disabled}>
                    {tStatus(s)}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {exitLocked && <p className="text-xs text-warning">{t("exitLockedHint")}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending || status === student.status}>
            {mutation.isPending ? t("submitting") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

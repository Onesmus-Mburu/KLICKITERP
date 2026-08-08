"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import type { StudentResponseDto } from "@klickit/contracts";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { useDeleteStudent } from "../hooks/use-students";

/**
 * Real delete action for a `std_student` row (Phase 6 Slice 2b — Student
 * delete). Reuses the exact trigger+confirm-dialog+error-banner shape
 * `DeleteClassButton`/`DeleteStreamButton` already established, not a new
 * pattern — same real consequence sentence before anything is sent, same
 * real-409-message-as-dialog-alert rendering.
 *
 * **Deliberately NOT a copy-paste of the classes/streams delete UX in one
 * way**: on a successful delete the current page's own data (the student
 * just deleted) no longer exists, so `handleConfirm()` navigates back to
 * `/students` instead of just closing the dialog in place — `DeleteClassButton`
 * stays on the same Classes & Streams page because that table just loses a row.
 *
 * A real `409` here names every real financial/cross-module reference that
 * still blocks deletion (`StudentsService.delete()`'s own pre-check — e.g.
 * "Cannot delete student: 3 ledger entry(s) and 1 invoice(s) still reference
 * it") — rendered as a dialog-level `Alert` banner with the backend's own
 * specific message (`ApiError.message`), same as the classes/streams
 * precedent, since this is a whole-request conflict, not a per-field
 * validation error.
 */
export function DeleteStudentButton({ student }: { student: StudentResponseDto }) {
  const t = useTranslations("students.detail.deleteStudentDialog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const mutation = useDeleteStudent();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  async function handleConfirm() {
    setError(null);
    try {
      await mutation.mutateAsync(student.id);
      setOpen(false);
      router.push("/students");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  const fullName = `${student.firstName} ${student.lastName}`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-destructive hover:bg-tint-destructive hover:text-destructive">
          <Trash2 className="size-4" />
          {tCommon("delete")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { name: fullName })}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={mutation.isPending}>
            {mutation.isPending ? t("deleting") : tCommon("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

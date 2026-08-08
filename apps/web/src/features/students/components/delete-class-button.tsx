"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import type { ClassResponseDto } from "@klickit/contracts";
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
import { useDeleteClass } from "../hooks/use-classes";

/**
 * Real delete action for a `std_class` row (Phase 6 Slice 2b — Class/Stream
 * delete). No delete endpoint existed anywhere in this module before this
 * pass — a deliberate, documented exclusion when the Classes & Streams page
 * was first built. Added because the user asked for real delete after the
 * leftover `E2E-CLASS-*`/`PAY-E2E-CLASS-*` test data this whole Phase 6
 * effort's own live-verification passes generated, and never cleaned up,
 * made the Classes list unusable.
 *
 * Same trigger+confirm-dialog+error-banner shape `exit-clear-action.tsx`
 * already established, not a new pattern. The confirm dialog states a real
 * consequence sentence naming the specific class before anything is sent —
 * this is a genuinely destructive, non-reversible action (unlike
 * `guardian-section.tsx`'s unlink, which just removes an association and
 * has no confirm step). A real `409` (students/streams still reference the
 * class — `ClassesService.delete()`'s own pre-check) is rendered here as a
 * DIALOG-LEVEL error banner with the backend's own specific message
 * (`ApiError.message`, e.g. "Cannot delete class: 12 student(s) and 2
 * stream(s) still reference it") — this is a whole-request conflict, not a
 * per-field validation error, so it deliberately does NOT go through
 * `parseFieldErrors`/`form.setError` the way `class-dialog.tsx`'s create/edit
 * form does for its 400s.
 */
export function DeleteClassButton({ classItem }: { classItem: ClassResponseDto }) {
  const t = useTranslations("students.classesPage.deleteClassDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const mutation = useDeleteClass();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  async function handleConfirm() {
    setError(null);
    try {
      await mutation.mutateAsync(classItem.id);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-destructive hover:bg-tint-destructive hover:text-destructive">
          <Trash2 className="size-4" />
          {tCommon("delete")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { name: classItem.name })}</DialogDescription>
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

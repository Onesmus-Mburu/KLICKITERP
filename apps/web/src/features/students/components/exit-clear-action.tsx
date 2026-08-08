"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import type { StudentResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { useExitClearStudent } from "../hooks/use-students";

/**
 * `exitCleared` manual flag-setter action. The confirm dialog's copy is
 * deliberately honest per the plan: this is CURRENTLY a manual flag-setter
 * only, not a real balance check — `StudentsService.markExitCleared()`'s own
 * doc comment states the real BR-BILL-15 zero-balance verification requires
 * Billing (Module 9), which doesn't exist yet. Never oversold as "verified
 * clear of balance."
 */
export function ExitClearAction({ student }: { student: StudentResponseDto }) {
  const t = useTranslations("students.detail");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const mutation = useExitClearStudent(student.id);

  if (student.exitCleared) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
        <CheckCircle2 className="size-3.5" />
        {t("exitClearedYes")}
      </span>
    );
  }

  async function handleConfirm() {
    setError(null);
    try {
      await mutation.mutateAsync();
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t("exitClearButton")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("exitClearConfirmTitle")}</DialogTitle>
          <DialogDescription>{t("exitClearConfirmDescription")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={handleConfirm} disabled={mutation.isPending}>
            {mutation.isPending ? t("exitClearing") : t("exitClearButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

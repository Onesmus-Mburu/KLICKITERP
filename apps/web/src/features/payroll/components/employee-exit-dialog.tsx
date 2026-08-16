"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import type { PyrlEmployeeResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useExitEmployee } from "../hooks/use-employees";

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

/**
 * Phase 6 Slice 22 Part 1 (Payroll foundations, Module 15) — `POST
 * .../employees/{id}/exit`, BR-PYRL-04's mid-period-proration trigger:
 * `isActive=false`, `exitDate` set (confirmed by reading
 * `EmployeesController.exit()`/`ExitPyrlEmployeeDto` directly — a single
 * required `exitDate` date-string field). The actual proration computation
 * itself is Pass B's run-computation concern (out of this part's own scope,
 * per `EmployeesService.exit()`'s own doc comment) — this dialog is only the
 * trigger, a confirm-style action with one required date input, defaulted to
 * today but freely editable (a backdated or future exit date is a real,
 * legitimate use, not guarded against client-side; the server itself imposes
 * no date constraint on `exit()`, confirmed by reading it directly).
 *
 * Only rendered for `isActive === true` employees (the caller,
 * `app/(erp)/payroll/employees/[id]/page.tsx`, never shows this trigger for
 * an already-exited employee) — `EmployeesService.exit()` itself has no
 * status guard either way, so re-exiting an already-exited employee would
 * silently succeed server-side, but the UI never offers that path.
 */
export function EmployeeExitDialog({ employee }: { employee: PyrlEmployeeResponseDto }) {
  const t = useTranslations("payroll.employees.exitDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [exitDate, setExitDate] = React.useState(todayIsoDate());
  const [error, setError] = React.useState<string | null>(null);

  const exitMutation = useExitEmployee();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setExitDate(todayIsoDate());
      setError(null);
    }
  }

  const canSubmit = !!exitDate && !exitMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await exitMutation.mutateAsync({ id: employee.id, exitDate });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="text-destructive hover:bg-tint-destructive hover:text-destructive">
          <LogOut className="size-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { name: employee.fullName })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <Alert variant="warning">
          <AlertDescription>{t("warning")}</AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label required>{t("exitDateLabel")}</Label>
          <Input type="date" value={exitDate} onChange={(e) => setExitDate(e.target.value)} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {exitMutation.isPending ? t("exiting") : t("exitButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

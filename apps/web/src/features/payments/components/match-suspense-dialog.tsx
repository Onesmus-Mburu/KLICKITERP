"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { UserCheck } from "lucide-react";
import type { StudentResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { formatMoney } from "@/lib/money";
import { StudentSearchBox } from "./student-search-box";
import { useMatchSuspenseItem } from "../hooks/use-suspense";
import type { SuspenseItem } from "../types";

/**
 * `POST /payments/suspense/{id}/match` (`{studentId}`) — reuses
 * `StudentSearchBox` verbatim (per the plan's explicit "reuse, don't
 * rebuild" instruction), the same server-driven debounced search the
 * receipt capture screen already uses. A real receipt is produced,
 * backdated to the item's own `receivedAt` (`SuspenseService.matchToStudent()`'s
 * own doc comment) — this dialog's copy says so plainly.
 */
export function MatchSuspenseDialog({ item }: { item: SuspenseItem }) {
  const t = useTranslations("payments.suspense");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [selectedStudent, setSelectedStudent] = React.useState<StudentResponseDto | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const matchMutation = useMatchSuspenseItem(item.id);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setSelectedStudent(null);
      setError(null);
    }
  }

  async function handleConfirm() {
    if (!selectedStudent) {
      setError(t("matchStudentRequired"));
      return;
    }
    setError(null);
    try {
      await matchMutation.mutateAsync({ studentId: selectedStudent.id });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <UserCheck className="size-4" />
          {t("matchTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("matchTitle")}</DialogTitle>
          <DialogDescription>{t("matchDescription", { amount: formatMoney(item.amount) })}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label required>{t("matchStudentLabel")}</Label>
          <StudentSearchBox selectedStudent={selectedStudent} onSelect={setSelectedStudent} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleConfirm()} disabled={matchMutation.isPending}>
            {matchMutation.isPending ? t("matching") : t("matchConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

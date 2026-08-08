"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { UserName } from "@/features/approvals/components/user-name";
import { useUsersForOperatorPicker } from "../hooks/use-users";
import { useAssignServicePointOperator, useServicePointOperators, useUnassignServicePointOperator } from "../hooks/use-service-points";

/**
 * Phase 6 Slice 11 (Part 3) — `POST`/`DELETE`/`GET
 * wallet-service-points/:id/operators` — a plain add/remove list of
 * `usr_user`s who can spend against this service point.
 * `ServicePointOperatorResponseDto` carries only `userId` (no name), so each
 * row's display name is resolved via `<UserName>`
 * (`features/approvals/components/user-name.tsx`, reused cross-feature —
 * same "resolve through an existing domain hook" discipline
 * `EntityLabel`/`GlAccountSelect` already established).
 */
export function ServicePointOperatorsDialog({ servicePointId, servicePointName }: { servicePointId: string; servicePointName: string }) {
  const t = useTranslations("wallet.servicePoints.operatorsDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [selectedUserId, setSelectedUserId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const operatorsQuery = useServicePointOperators(open ? servicePointId : undefined);
  const usersQuery = useUsersForOperatorPicker();
  const assignMutation = useAssignServicePointOperator(servicePointId);
  const unassignMutation = useUnassignServicePointOperator(servicePointId);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setSelectedUserId("");
      setError(null);
    }
  }

  const operators = operatorsQuery.data ?? [];
  const assignedUserIds = new Set(operators.map((op) => op.userId));
  const pickerItems = (usersQuery.data?.items ?? [])
    .filter((u) => !assignedUserIds.has(u.id))
    .map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})` }));

  async function handleAssign() {
    setError(null);
    if (!selectedUserId) {
      setError(t("selectUserError"));
      return;
    }
    try {
      await assignMutation.mutateAsync({ userId: selectedUserId });
      setSelectedUserId("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  async function handleUnassign(userId: string) {
    setError(null);
    try {
      await unassignMutation.mutateAsync(userId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { name: servicePointName })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("currentOperatorsLabel")}</Label>
            {operators.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noOperators")}</p>
            ) : (
              <ul className="space-y-1.5">
                {operators.map((op) => (
                  <li key={op.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
                    <UserName id={op.userId} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => void handleUnassign(op.userId)}
                      disabled={unassignMutation.isPending}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>{t("addOperatorLabel")}</Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Combobox
                  items={pickerItems}
                  value={selectedUserId}
                  onChange={setSelectedUserId}
                  placeholder={usersQuery.isLoading ? t("loadingUsers") : t("selectUser")}
                  searchPlaceholder={t("searchUser")}
                  emptyText={t("noUsersFound")}
                  disabled={usersQuery.isLoading}
                />
              </div>
              <Button type="button" onClick={() => void handleAssign()} disabled={assignMutation.isPending}>
                {assignMutation.isPending ? t("assigning") : t("assign")}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {tCommon("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

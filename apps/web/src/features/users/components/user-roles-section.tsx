"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useRoles } from "@/features/roles/hooks/use-roles";
import { useAssignRoleToUser, useUnassignRoleFromUser, useUserRoles } from "../hooks/use-users";

/**
 * List + Combobox-add + per-row-remove, mirroring
 * `ServicePointOperatorsDialog`
 * (`features/wallet/components/service-point-operators-dialog.tsx`) — the
 * established many-to-many-assignment shape in this codebase. Rendered
 * inline on the User detail page (not behind its own dialog trigger, unlike
 * its precedent), per the plan. Roles come from `useRoles()` (`features/
 * roles`, the correct cross-feature dependency direction: Users ships last,
 * consumes the reference-data feature that shipped first), filtered to those
 * this user doesn't already hold. `POST /users/:id/roles` is SoD-checked
 * (FR-USER-009.1) — a rejection's real server message is surfaced verbatim,
 * same discipline `PermissionGrantCell` already established.
 */
export function UserRolesSection({ userId }: { userId: string }) {
  const t = useTranslations("users.rolesSection");
  const [selectedRoleId, setSelectedRoleId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const userRolesQuery = useUserRoles(userId);
  const rolesQuery = useRoles();
  const assignMutation = useAssignRoleToUser(userId);
  const unassignMutation = useUnassignRoleFromUser(userId);

  const userRoles = userRolesQuery.data ?? [];
  const assignedRoleIds = new Set(userRoles.map((r) => r.id));
  const pickerItems = (rolesQuery.data ?? [])
    .filter((r) => !assignedRoleIds.has(r.id))
    .map((r) => ({ value: r.id, label: r.name }));

  async function handleAssign() {
    setError(null);
    if (!selectedRoleId) {
      setError(t("selectRoleError"));
      return;
    }
    try {
      await assignMutation.mutateAsync(selectedRoleId);
      setSelectedRoleId("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  async function handleUnassign(roleId: string) {
    setError(null);
    try {
      await unassignMutation.mutateAsync(roleId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label>{t("currentRolesLabel")}</Label>
        {userRoles.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noRoles")}</p>
        ) : (
          <ul className="space-y-1.5">
            {userRoles.map((role) => (
              <li key={role.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
                <span className="font-medium text-foreground">{role.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={() => void handleUnassign(role.id)}
                  disabled={unassignMutation.isPending}
                  aria-label={t("removeRole", { name: role.name })}
                >
                  <X className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>{t("addRoleLabel")}</Label>
        <div className="flex gap-2">
          <div className="flex-1">
            <Combobox
              items={pickerItems}
              value={selectedRoleId}
              onChange={setSelectedRoleId}
              placeholder={rolesQuery.isLoading ? t("loadingRoles") : t("selectRole")}
              searchPlaceholder={t("searchRole")}
              emptyText={t("noRolesFound")}
              disabled={rolesQuery.isLoading}
            />
          </div>
          <Button type="button" onClick={() => void handleAssign()} disabled={assignMutation.isPending}>
            {assignMutation.isPending ? t("assigning") : t("assign")}
          </Button>
        </div>
      </div>
    </div>
  );
}

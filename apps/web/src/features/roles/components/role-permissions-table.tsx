"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/patterns/data-table";
import { ApiError } from "@/lib/api-error";
import { useGrantPermission, useRevokePermission, type PermissionWithGrantState } from "../hooks/use-role-permissions";

/**
 * Each row's checkbox fires grant/revoke INSTANTLY on toggle — no confirm
 * dialog, mirrors `TermBillingLockToggle`'s established "instantly
 * reversible, no-confirm" pattern
 * (`features/settings/components/term-billing-lock-toggle.tsx`, read first
 * as the cited precedent). Its own `useGrantPermission(roleId)`/
 * `useRevokePermission(roleId)` instances are per-ROW (not hoisted/shared),
 * same as that toggle's own per-row `useSetTermBillingLock()` instance —
 * TanStack Query mutation hooks are cheap, independent instances, so this
 * keeps each row's pending/error state fully isolated from every other
 * row's, and one row's rejection (e.g. a BR-SEC-04/SoD-conflict 422) never
 * disturbs any other row's checkbox.
 */
function PermissionGrantCell({ roleId, code, granted }: { roleId: string; code: string; granted: boolean }) {
  const t = useTranslations("roles.detail");
  const grantMutation = useGrantPermission(roleId);
  const revokeMutation = useRevokePermission(roleId);
  const [error, setError] = React.useState<string | null>(null);
  const isPending = grantMutation.isPending || revokeMutation.isPending;

  async function handleChange(next: boolean) {
    setError(null);
    try {
      if (next) {
        await grantMutation.mutateAsync(code);
      } else {
        await revokeMutation.mutateAsync(code);
      }
    } catch (err) {
      // A BR-SEC-04/SoD-conflict rejection's real server message is the
      // useful information here — surfaced verbatim, not replaced with a
      // generic fallback (per the plan's own explicit instruction).
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-1">
      <Checkbox
        checked={granted}
        disabled={isPending}
        onChange={(e) => void handleChange(e.target.checked)}
        aria-label={t("grantCheckboxLabel", { code })}
      />
      {error && (
        <Alert variant="destructive" className="max-w-xs p-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export function RolePermissionsTable({ roleId, rows }: { roleId: string; rows: PermissionWithGrantState[] }) {
  const t = useTranslations("roles.detail");

  const columns = React.useMemo<ColumnDef<PermissionWithGrantState>[]>(
    () => [
      { id: "code", header: t("columns.code"), cell: ({ row }) => <code className="text-xs">{row.original.permission.code}</code> },
      { id: "description", header: t("columns.description"), cell: ({ row }) => row.original.permission.description ?? "—" },
      {
        id: "type",
        header: t("columns.type"),
        cell: ({ row }) => (
          <Badge variant={row.original.permission.isWrite ? "soft-warning" : "soft-secondary"}>
            {row.original.permission.isWrite ? t("writeBadge") : t("readBadge")}
          </Badge>
        ),
      },
      {
        id: "granted",
        header: t("columns.granted"),
        cell: ({ row }) => <PermissionGrantCell roleId={roleId} code={row.original.permission.code} granted={row.original.granted} />,
      },
    ],
    [t, roleId],
  );

  return <DataTable columns={columns} data={rows} />;
}

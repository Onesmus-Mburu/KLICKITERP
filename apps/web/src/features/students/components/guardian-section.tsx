"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Star, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { ApiError } from "@/lib/api-error";
import { useStudentGuardians, useUnlinkGuardian } from "../hooks/use-guardians";
import { GuardianLinkDialog } from "./guardian-link-dialog";

/**
 * Self-contained widget with its own `<QueryBoundary>` (`useStudentGuardians`
 * already matches `QueryBoundaryProps<T>["query"]`'s shape — see that hook's
 * own doc comment), same "each section gets its own independent boundary"
 * discipline dashboard's per-widget isolation established — a guardian-list
 * failure never blanks the rest of the student detail page.
 */
export function GuardianSection({ studentId }: { studentId: string }) {
  const t = useTranslations("students.guardianSection");
  const guardiansQuery = useStudentGuardians(studentId);
  const unlinkMutation = useUnlinkGuardian(studentId);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [unlinkError, setUnlinkError] = React.useState<string | null>(null);

  async function handleUnlink(guardianId: string) {
    setUnlinkError(null);
    try {
      await unlinkMutation.mutateAsync(guardianId);
    } catch (err) {
      setUnlinkError(err instanceof ApiError ? err.message : t("unlinkError"));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <UserPlus className="size-4" />
          {t("linkGuardian")}
        </Button>
      </div>

      {unlinkError && <p className="text-xs text-destructive">{unlinkError}</p>}

      <QueryBoundary query={guardiansQuery}>
        {(rows) => (
          <ul className="space-y-2">
            {rows.map(({ link, guardian }) => (
              <li key={link.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {guardian?.fullName ?? "—"}
                    {link.isPrimary && (
                      <Badge variant="soft-primary">
                        <Star className="mr-1 size-3" />
                        {t("primary")}
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {/* Phase 6 Slice 2b item 4: phone is now optional (guardian may be email-only) — show phone if present, else fall back to email, else "—", instead of always showing phone's "—" placeholder alongside a real email. */}
                    {link.relationship} · {guardian?.phone ?? guardian?.email ?? "—"}
                    {guardian?.phone && guardian?.email ? ` · ${guardian.email}` : ""}
                    {link.receivesBilling ? ` · ${t("receivesBilling")}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => handleUnlink(link.guardianId)} disabled={unlinkMutation.isPending}>
                  <Trash2 className="size-4" />
                  {t("unlink")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </QueryBoundary>

      <GuardianLinkDialog studentId={studentId} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

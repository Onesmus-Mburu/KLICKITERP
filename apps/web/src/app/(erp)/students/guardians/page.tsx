"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { QueryObserverResult } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import type { GuardianListItemResponseDto } from "@klickit/contracts";
import { Eye, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useGuardians } from "@/features/students/hooks/use-guardians";
import { GuardianDialog } from "@/features/students/components/guardian-dialog";

/**
 * The standalone Parents/Guardians directory — placed in the nav right after
 * Students, before Classes & Streams. `GuardiansController_list` is a real,
 * unpaginated bare array (confirmed by reading `guardians.controller.ts`
 * directly, no pagination anywhere in Module 8), so search here is a plain
 * client-side filter over the already-fetched list, same as
 * `guardian-link-dialog.tsx`'s own "existing guardian" search does — no
 * server-side search param exists on this endpoint to call instead. Row
 * click navigates to the guardian's own detail page (their linked children,
 * profile edit); the "New Parent" dialog creates a bare, unlinked guardian —
 * link them to a child either from here (the detail page's own "Link a
 * student" action) or from a student's own Guardians section.
 */
export default function GuardiansPage() {
  const t = useTranslations("students.guardiansPage");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const guardiansQuery = useGuardians();
  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = guardiansQuery.data ?? [];
    if (!q) return all;
    return all.filter(
      (g) => g.fullName.toLowerCase().includes(q) || (g.phone ?? "").includes(q) || (g.email ?? "").toLowerCase().includes(q),
    );
  }, [guardiansQuery.data, search]);

  const columns = React.useMemo<ColumnDef<GuardianListItemResponseDto>[]>(
    () => [
      { accessorKey: "fullName", header: t("table.fullName") },
      {
        id: "contact",
        header: t("table.contact"),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.phone ?? "—"}
            {row.original.phone && row.original.email ? ` · ${row.original.email}` : (row.original.email ?? "")}
          </span>
        ),
      },
      {
        accessorKey: "studentCount",
        header: t("table.studentCount"),
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Users className="size-3.5 text-muted-foreground" />
            {row.original.studentCount}
          </span>
        ),
      },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/students/guardians/${row.original.id}`);
            }}
          >
            <Eye className="size-4" />
            {tCommon("view")}
          </Button>
        ),
      },
    ],
    [t, tCommon, router],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          {t("newParent")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <Input placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="mt-2 max-w-sm" />
        </CardHeader>
        <CardContent>
          <QueryBoundary
            query={{
              isPending: guardiansQuery.isPending,
              isError: guardiansQuery.isError,
              error: guardiansQuery.error,
              data: filtered,
              // Same cast-only-at-the-return-boundary pattern `students/page.tsx`
              // already established for the identical bulk-fetch-then-client-filter
              // shape — `<QueryBoundary>` only calls `refetch()` to trigger a
              // re-fetch and discards the return value.
              refetch: guardiansQuery.refetch as unknown as () => Promise<QueryObserverResult<GuardianListItemResponseDto[], unknown>>,
            }}
            isEmpty={(d) => d.length === 0}
          >
            {(data) => <DataTable columns={columns} data={data} onRowClick={(g) => router.push(`/students/guardians/${g.id}`)} />}
          </QueryBoundary>
        </CardContent>
      </Card>

      <GuardianDialog mode="create" open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eye, Search } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { RoleResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useRoles } from "@/features/roles/hooks/use-roles";
import { CreateRoleDialog } from "@/features/roles/components/create-role-dialog";
import { EditRoleDialog } from "@/features/roles/components/edit-role-dialog";
import { RoleBadges } from "@/features/roles/components/role-badges";

/**
 * Phase 6 Slice 13 Part 2 — `users:role:view`/`:create`/`:update`. Direct
 * structural mirror of `settings/custom-fields/page.tsx` (Card + a
 * `<DataTable>` inside `<QueryBoundary isEmpty>`, a create-dialog trigger
 * in the header, a per-row edit dialog) — read first as the cited
 * precedent. Row click navigates to `/roles/[id]` (via `<DataTable>`'s
 * new, additive `onRowClick` prop, Phase 6 Slice 13 Part 2's own small
 * extension to that shared component) — the module-scoped permission
 * grant/revoke table lives there, not inline on this list page (259 codes
 * across 24 modules is too much to show per row here).
 *
 * **Search field (added post-Slice-13)** — plain CLIENT-SIDE substring
 * filter (name + description), no debounce, no backend change: `GET /roles`
 * (`useRoles()`) already returns every role, unpaginated (confirmed by
 * reading `RolesController.list()` directly — no `page`/`pageSize` support
 * exists, matches this screen's own established "small, unbounded dataset"
 * shape from Part 2), so there is nothing to search server-side — this
 * mirrors `settings/academic-calendar/page.tsx`'s own client-side
 * `yearSearch`/`filteredYears` precedent, not the debounced-server-search
 * shape `WalletsTable`/`OpenInvoicesTable` use for genuinely paginated data.
 */
export default function RolesPage() {
  const t = useTranslations("roles.list");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const rolesQuery = useRoles();
  const [search, setSearch] = React.useState("");

  const filterRoles = React.useCallback(
    (roles: RoleResponseDto[]) => {
      const term = search.trim().toLowerCase();
      if (!term) return roles;
      return roles.filter(
        (r) => r.name.toLowerCase().includes(term) || (r.description ?? "").toLowerCase().includes(term),
      );
    },
    [search],
  );

  const columns = React.useMemo<ColumnDef<RoleResponseDto>[]>(
    () => [
      { accessorKey: "name", header: t("columns.name") },
      { id: "description", header: t("columns.description"), cell: ({ row }) => row.original.description ?? "—" },
      { id: "badges", header: t("columns.badges"), cell: ({ row }) => <RoleBadges role={row.original} /> },
      {
        id: "actions",
        header: t("columns.actions"),
        // Stops the click from bubbling to the row's own `onRowClick`
        // navigation — same "nested interactive element inside a clickable
        // row" guard `<DataTable>`'s own doc comment documents.
        cell: ({ row }) => (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => router.push(`/roles/${row.original.id}`)}
            >
              <Eye className="size-4" />
              {tCommon("view")}
            </Button>
            <EditRoleDialog role={row.original} />
          </div>
        ),
      },
    ],
    [t, tCommon, router],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateRoleDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <QueryBoundary query={rolesQuery} isEmpty={(d) => d.length === 0}>
            {(roles) => {
              const filtered = filterRoles(roles);
              return filtered.length === 0 && search.trim() ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("noRolesMatchSearch")}</p>
              ) : (
                <DataTable columns={columns} data={filtered} onRowClick={(role) => router.push(`/roles/${role.id}`)} />
              );
            }}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}

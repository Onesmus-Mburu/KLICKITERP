"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Search } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { UserResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable, type ServerPaginationState } from "@/components/patterns/data-table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUsers } from "@/features/users/hooks/use-users";
import { UserStatusBadge } from "@/features/users/components/user-status-badge";
import { UserFilters, EMPTY_USER_FILTERS, type UserFiltersValue } from "@/features/users/components/user-filters";

const DEFAULT_PAGE_SIZE = 10;
/** Same "only fire once 2+ characters are typed" convention `WalletsTable` established for this exact shape (debounced server search against a real paginated endpoint). */
const MIN_SEARCH_LENGTH = 2;

/**
 * Phase 6 Slice 13 Part 4 — the Users list, `users:user:view`-gated. Real
 * server pagination (`<DataTable serverPagination>`) — Part 1's `@ApiQuery`
 * fix means `page`/`pageSize` are correctly-typed optional numbers in the
 * generated query type (confirmed directly against `generated/
 * openapi-types.ts`'s `UsersController_list` entry before building this, not
 * assumed from the plan's own claim), so this is the real thing, not the
 * usual codegen-gap workaround Pending/Upcoming/Receipts needed. Filter
 * `Card`: department + status `<Select>`s (`UserFilters`, mirrors
 * `student-filters.tsx`'s own department+status shape). Row click ->
 * `/users/[id]` (`<DataTable>`'s `onRowClick` prop, Part 2's own small
 * extension to that shared component).
 *
 * **Search field (added post-Slice-13)** — a real, debounced, SERVER-SIDE
 * search (`q`, `WalletsTable`'s own exact shape) — unlike Roles/Departments,
 * `GET /users` is genuinely paginated (157+ real rows in this dev
 * environment), so a client-side-only filter would silently only search
 * whatever happened to be on the current page. Required a small backend
 * addition (`UsrUserRepository.list()`'s new `q` param — ILIKE across
 * username/fullName/email/phone) since no search capability existed on this
 * endpoint before.
 */
export default function UsersPage() {
  const t = useTranslations("users.list");
  const tType = useTranslations("users.userType");
  const router = useRouter();
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const [filters, setFilters] = React.useState<UserFiltersValue>(EMPTY_USER_FILTERS);
  const [searchDraft, setSearchDraft] = React.useState("");
  const debouncedSearch = useDebouncedValue(searchDraft, 300);
  const trimmedSearch = debouncedSearch.trim();
  const q = trimmedSearch.length >= MIN_SEARCH_LENGTH ? trimmedSearch : undefined;

  const usersQuery = useUsers({
    page,
    pageSize,
    departmentId: filters.departmentId ?? undefined,
    status: filters.status ?? undefined,
    q,
  });

  // A filter or search change is a genuinely different result set — page 1 is always valid.
  React.useEffect(() => {
    setPage(1);
  }, [filters.departmentId, filters.status, q]);

  const total = usersQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const serverPagination: ServerPaginationState = {
    page,
    pageSize,
    totalPages,
    onPageChange: setPage,
    onPageSizeChange: (newSize: number) => {
      setPageSize(newSize);
      setPage(1);
    },
  };

  const columns = React.useMemo<ColumnDef<UserResponseDto>[]>(
    () => [
      { accessorKey: "username", header: t("columns.username") },
      { accessorKey: "fullName", header: t("columns.fullName") },
      { id: "status", header: t("columns.status"), cell: ({ row }) => <UserStatusBadge status={row.original.status} /> },
      { id: "userType", header: t("columns.userType"), cell: ({ row }) => tType(row.original.userType) },
      { id: "departmentName", header: t("columns.departmentName"), cell: ({ row }) => row.original.departmentName ?? "—" },
    ],
    [t, tType],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/users/new">
            <Plus className="size-4" />
            {t("newUser")}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("filtersTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t("searchPlaceholder")}
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
            />
          </div>
          <UserFilters value={filters} onChange={setFilters} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={usersQuery} isEmpty={(d) => d.items.length === 0}>
            {(data) => (
              <DataTable
                columns={columns}
                data={data.items}
                serverPagination={serverPagination}
                onRowClick={(user) => router.push(`/users/${user.id}`)}
              />
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}

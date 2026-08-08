"use client";

import * as React from "react";
import { type ColumnDef, flexRender, getCoreRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Generic `@tanstack/react-table` wrapper, wired to the backend's real
 * pagination contract — `PaginationQueryDto`
 * (`packages/server/src/shared/pagination/pagination.dto.ts`, mirrored at
 * `@klickit/contracts`' `PaginationQueryDtoSchema`): `page` (1-based),
 * `pageSize`, `sortBy`, `sortDir: "ASC" | "DESC"`. When `serverPagination`
 * is supplied, this component is a pure presentational shell (no local
 * `getPaginationRowModel`) driving those exact field names straight from
 * its callbacks — the caller's TanStack Query hook owns the actual
 * page/sort state and refetches. Without it, falls back to client-side
 * pagination for a small, already-fully-loaded dataset (used by this
 * slice's own Top-Defaulters table, since `GET /dashboard/defaulters/top`
 * only accepts a `limit`, not full server-side pagination — this component
 * stays ready for a future paginated list endpoint to plug straight in).
 */
/**
 * Phase 6 Slice 2c — `pageSize` was declared here since Slice 1 but never
 * actually read anywhere in this component's body (confirmed by reading the
 * file before this pass); `onPageSizeChange` is new. `PAGE_SIZE_OPTIONS`
 * (10/25/50/100, defaulting to 10) is the real, fixed option set the plan
 * specifies — not configurable per-caller, since every current/near-term
 * caller of `serverPagination` wants the same set.
 */
export interface ServerPaginationState {
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  serverPagination?: ServerPaginationState;
  /**
   * Phase 6 Slice 13 Part 2 — optional, additive (every pre-existing caller
   * omits it and is unaffected). When supplied, each body row becomes a
   * real navigation target (`RolesPage`'s "row click -> /roles/[id]"
   * requirement) — cell content that shouldn't trigger it (e.g. an actions
   * column's dialog trigger) must stop the click from bubbling itself
   * (`onClick={(e) => e.stopPropagation()}` on that cell's wrapper), same
   * as any nested-interactive-element-inside-a-clickable-row pattern.
   */
  onRowClick?: (row: TData) => void;
}

export function DataTable<TData, TValue>({ columns, data, serverPagination, onRowClick }: DataTableProps<TData, TValue>) {
  const tCommon = useTranslations("common");
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    ...(serverPagination ? {} : { getPaginationRowModel: getPaginationRowModel() }),
    manualPagination: !!serverPagination,
  });

  return (
    <div className="space-y-3">
      {/* Slice 1.5b (visual polish iteration): `rounded-md` -> `rounded-lg`
          (matching the button/input radius tier — Card is the only
          `rounded-xl` surface, and this table already sits nested inside a
          Card at every current call site, so `xl` here would double up).
          Plain `border-border` (not `/NN`-softened) — this app's colors are
          raw `var(--x)` custom properties, so Tailwind's opacity modifiers
          silently no-op on them (see query-boundary.tsx's doc comment on
          the same discovered limitation); `--border` is already a subtle
          token on its own. */}
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={onRowClick ? "cursor-pointer hover:bg-muted/50" : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {serverPagination && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{tCommon("rowsPerPage")}</span>
            <Select
              value={String(serverPagination.pageSize)}
              onValueChange={(v) => serverPagination.onPageSizeChange(Number(v))}
            >
              <SelectTrigger className="h-8 w-[72px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="text-muted-foreground">{tCommon("page", { current: serverPagination.page, total: serverPagination.totalPages })}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={serverPagination.page <= 1} onClick={() => serverPagination.onPageChange(serverPagination.page - 1)}>
              <ChevronLeft className="size-4" /> {tCommon("previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={serverPagination.page >= serverPagination.totalPages}
              onClick={() => serverPagination.onPageChange(serverPagination.page + 1)}
            >
              {tCommon("next")} <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

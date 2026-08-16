"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PAGE_SIZE_OPTIONS, type ServerPaginationState } from "@/components/patterns/data-table";
import { cn } from "@/lib/utils";
import type { ApiCallDirection, ApiCallLogEntity } from "../api/license.api";

const DIRECTION_VARIANT: Record<ApiCallDirection, "soft-primary" | "soft-secondary"> = {
  IN: "soft-primary",
  OUT: "soft-secondary",
};

/**
 * A plain `<Table>` built by hand (not `<DataTable>`) — same reasoning as
 * `accounting/components/integrity-run-list.tsx`'s own doc comment:
 * `<DataTable>` has no expand/detail-row mechanism, and `requestBody`/
 * `responseBody` are genuinely arbitrary JSON with no fixed shape to render
 * as columns, so each row expands inline to a raw `<pre>` JSON dump — the
 * same fallback presentation `integrity-run-findings.tsx` already
 * established for unstructured JSON elsewhere in this codebase. Pagination
 * controls below mirror `<DataTable serverPagination>`'s own UI exactly
 * (same `PAGE_SIZE_OPTIONS`, same `common.*` copy) since this table can't
 * reuse that component's body but should still look identical to every
 * other paginated table in the app.
 */
export function ApiCallLogTable({ items, serverPagination }: { items: ApiCallLogEntity[]; serverPagination: ServerPaginationState }) {
  const t = useTranslations("license.apiLog");
  const tCommon = useTranslations("common");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>{t("columns.at")}</TableHead>
              <TableHead>{t("columns.direction")}</TableHead>
              <TableHead>{t("columns.endpoint")}</TableHead>
              <TableHead>{t("columns.callerKeyId")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((entry) => {
              const expanded = expandedId === entry.id;
              return (
                <React.Fragment key={entry.id}>
                  <TableRow className="cursor-pointer" onClick={() => setExpandedId(expanded ? null : entry.id)}>
                    <TableCell>
                      <ChevronRight className={cn("size-4 transition-transform", expanded && "rotate-90")} />
                    </TableCell>
                    <TableCell>{new Date(entry.at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={DIRECTION_VARIANT[entry.direction]}>{t(`directions.${entry.direction}`)}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{entry.endpoint}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{entry.callerKeyId ?? "—"}</TableCell>
                  </TableRow>
                  {expanded && (
                    <TableRow>
                      <TableCell colSpan={5} className="bg-muted/20">
                        <div className="grid gap-3 px-1 py-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">{t("requestBody")}</p>
                            <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 text-xs">
                              {entry.requestBody !== null ? JSON.stringify(entry.requestBody, null, 2) : t("noBody")}
                            </pre>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">{t("responseBody")}</p>
                            <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 text-xs">
                              {entry.responseBody !== null ? JSON.stringify(entry.responseBody, null, 2) : t("noBody")}
                            </pre>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{tCommon("rowsPerPage")}</span>
          <Select value={String(serverPagination.pageSize)} onValueChange={(v) => serverPagination.onPageSizeChange(Number(v))}>
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
          <Button
            variant="outline"
            size="sm"
            disabled={serverPagination.page <= 1}
            onClick={() => serverPagination.onPageChange(serverPagination.page - 1)}
          >
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
    </div>
  );
}

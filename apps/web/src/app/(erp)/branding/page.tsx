"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus, Search } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { ThemeResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useThemes } from "@/features/branding/hooks/use-themes";
import { ThemeStatusBadge } from "@/features/branding/components/theme-status-badge";
import { PublishThemeButton } from "@/features/branding/components/publish-theme-button";
import { RevertThemeButton } from "@/features/branding/components/revert-theme-button";
import { publishedEditBlockedMessage } from "@/features/branding/constants";

/**
 * `branding:theme:view`-gated server-side — this page enforces nothing
 * itself beyond rendering whatever `<QueryBoundary>`'s real 403 state shows,
 * same discipline every other list page in this app follows. `GET
 * /branding/themes` is unpaginated (small, unbounded set — confirmed
 * directly against `ThemesController.list()`), so this is a plain
 * client-side name filter over the already-fully-loaded list, mirroring
 * `settings/academic-calendar/page.tsx`'s own `yearSearch` pattern, not the
 * debounced server-search shape `users/page.tsx` needs for a genuinely
 * paginated endpoint.
 *
 * Phase 6 Slice 14 Part 2: the Publish/Revert/Preview columns and the
 * disabled-when-published Edit cell below are real now — a theme actually
 * reaching `PUBLISHED`/`ARCHIVED` was impossible before this part existed.
 */
export default function BrandingPage() {
  const t = useTranslations("branding.list");
  const themesQuery = useThemes();
  const [nameSearch, setNameSearch] = React.useState("");

  const filteredThemes = React.useMemo(() => {
    const query = nameSearch.trim().toLowerCase();
    if (!query || !themesQuery.data) return themesQuery.data;
    return themesQuery.data.filter((theme) => theme.name.toLowerCase().includes(query));
  }, [themesQuery.data, nameSearch]);

  const columns = React.useMemo<ColumnDef<ThemeResponseDto>[]>(
    () => [
      { accessorKey: "name", header: t("columns.name") },
      { id: "status", header: t("columns.status"), cell: ({ row }) => <ThemeStatusBadge status={row.original.status} /> },
      {
        id: "publish",
        header: t("columns.publish"),
        cell: ({ row }) => <PublishThemeButton theme={row.original} />,
      },
      {
        // Revert is only ever meaningful for an ARCHIVED theme — the button
        // itself stays a plain "always render" component (per its own doc
        // comment); THIS cell is the one place that decides whether to
        // render it at all, per the plan's own split of responsibility.
        id: "revert",
        header: t("columns.revert"),
        cell: ({ row }) => (row.original.status === "ARCHIVED" ? <RevertThemeButton theme={row.original} /> : null),
      },
      {
        // Preview works for ANY status (no side effects server-side), so
        // this link is never conditional/disabled, unlike Edit below.
        id: "preview",
        header: t("columns.preview"),
        cell: ({ row }) => (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/branding/${row.original.id}/preview`}>{t("columns.preview")}</Link>
          </Button>
        ),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        cell: ({ row }) => {
          // Disabled, not hidden, once PUBLISHED (matches the real 422 from
          // `PATCH /branding/themes/:id` — `ThemesService.update()`). A real
          // `<button disabled>` here, not a `Button asChild` wrapping a
          // disabled `<Link>`: HTML's `disabled` attribute has no effect on
          // an `<a>` (Link renders one) — neither the `:disabled` CSS
          // pseudo-class `buttonVariants` styles against nor real
          // click-prevention would apply to a disabled anchor, so this
          // branches to a genuine `<button>` instead of trying to "disable"
          // a link.
          if (row.original.status === "PUBLISHED") {
            return (
              <Button type="button" variant="outline" size="sm" disabled title={publishedEditBlockedMessage(row.original.name)}>
                {t("columns.edit")}
              </Button>
            );
          }
          return (
            <Button asChild variant="outline" size="sm">
              <Link href={`/branding/${row.original.id}/edit`}>{t("columns.edit")}</Link>
            </Button>
          );
        },
      },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/branding/new">
            <Plus className="size-4" />
            {t("newTheme")}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={nameSearch} onChange={(e) => setNameSearch(e.target.value)} placeholder={t("searchPlaceholder")} />
          </div>
          <QueryBoundary query={themesQuery} isEmpty={(d) => d.length === 0}>
            {() =>
              filteredThemes && filteredThemes.length > 0 ? (
                <DataTable columns={columns} data={filteredThemes} />
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("noThemesMatchSearch")}</p>
              )
            }
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}

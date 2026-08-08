"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { TemplateResponseDto } from "@klickit/contracts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useTemplates } from "@/features/comms/hooks/use-templates";
import { CreateTemplateDialog } from "@/features/comms/components/create-template-dialog";
import { EditTemplateDialog } from "@/features/comms/components/edit-template-dialog";
import { DeleteTemplateButton } from "@/features/comms/components/delete-template-button";
import { ChannelBadge } from "@/features/comms/components/channel-badge";

const BODY_PREVIEW_LENGTH = 60;

/**
 * Phase 6 Slice 15 Part 1 — `comms:template:view`/`:manage`. Direct
 * structural mirror of `app/(erp)/departments/page.tsx` (Card + a
 * `<DataTable>` inside `<QueryBoundary isEmpty>`, a create-dialog trigger in
 * the header, per-row edit + delete actions). No detail/`[id]` sub-page —
 * unlike Roles, a template has no sub-resource for a detail page to show
 * (`Broadcasts`/`Messages`/`Optouts`/`Trigger Bindings`/`My Devices` are
 * separate Comms screens, built in later parts, not sub-resources of a
 * single template row).
 *
 * **Search field** — plain CLIENT-SIDE substring filter (event code +
 * subject), no debounce, no backend change: `GET /comms/templates` is
 * unpaginated (confirmed by reading `TemplatesController.list()` directly),
 * the same "small, unbounded dataset" shape `roles/page.tsx`'s/
 * `departments/page.tsx`'s own search fields already established.
 */
export default function TemplatesPage() {
  const t = useTranslations("communications.list");
  const tCommon = useTranslations("common");
  const templatesQuery = useTemplates();
  const [search, setSearch] = React.useState("");

  const filterTemplates = React.useCallback(
    (templates: TemplateResponseDto[]) => {
      const term = search.trim().toLowerCase();
      if (!term) return templates;
      return templates.filter(
        (tpl) => tpl.eventCode.toLowerCase().includes(term) || (tpl.subject ?? "").toLowerCase().includes(term),
      );
    },
    [search],
  );

  const columns = React.useMemo<ColumnDef<TemplateResponseDto>[]>(
    () => [
      { accessorKey: "eventCode", header: t("columns.eventCode") },
      { id: "channel", header: t("columns.channel"), cell: ({ row }) => <ChannelBadge channel={row.original.channel} /> },
      { accessorKey: "locale", header: t("columns.locale") },
      {
        id: "subject",
        header: t("columns.subject"),
        // SMS/PUSH templates may have no subject at all (`subject` is
        // nullable — `comm_template.subject`) — falls back to a truncated
        // body preview so the row is never blank, per this part's plan.
        cell: ({ row }) => {
          const tpl = row.original;
          if (tpl.subject) return tpl.subject;
          const preview = tpl.body.length > BODY_PREVIEW_LENGTH ? `${tpl.body.slice(0, BODY_PREVIEW_LENGTH)}…` : tpl.body;
          return <span className="text-muted-foreground">{preview}</span>;
        },
      },
      {
        id: "isActive",
        header: t("columns.isActive"),
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "soft-success" : "soft-secondary"}>
            {row.original.isActive ? tCommon("active") : tCommon("inactive")}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <EditTemplateDialog template={row.original} />
            <DeleteTemplateButton template={row.original} />
          </div>
        ),
      },
    ],
    [t, tCommon],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateTemplateDialog />
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
          <QueryBoundary query={templatesQuery} isEmpty={(d) => d.length === 0}>
            {(templates) => {
              const filtered = filterTemplates(templates);
              return filtered.length === 0 && search.trim() ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("noTemplatesMatchSearch")}</p>
              ) : (
                <DataTable columns={columns} data={filtered} />
              );
            }}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}

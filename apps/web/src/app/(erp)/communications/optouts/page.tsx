"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { OptoutResponseDto } from "@klickit/contracts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/patterns/data-table";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useOptoutsByGuardian } from "@/features/comms/hooks/use-optouts";
import { CreateOptoutDialog } from "@/features/comms/components/create-optout-dialog";
import { DeleteOptoutButton } from "@/features/comms/components/delete-optout-button";
import { ChannelBadge } from "@/features/comms/components/channel-badge";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Phase 6 Slice 15 Part 3 — `comms:optout:manage` (gates all 3 routes this
 * page touches, per `optouts.api.ts`'s own doc comment). A real, honest
 * constraint this page is BUILT AROUND, not worked around: there is no
 * guardian/student directory anywhere in this codebase yet (Students
 * module, #8, isn't built), and `GET /comms/optouts` has no "list all" mode
 * — `guardianId` is REQUIRED (confirmed by reading `OptoutsController
 * .listByGuardian()` directly). So this page is search-by-guardianId-FIRST,
 * not a browsable list: a plain `<Input>` for a raw guardian uuid (typed or
 * pasted), gated behind an explicit Search action (not fired on every
 * keystroke — a uuid lookup key isn't a substring search) — the same
 * plain-`<Input>`-for-an-unvalidatable-FK-less-id reasoning
 * `create-optout-dialog.tsx`'s own `guardianId` field gives.
 *
 * Before any search, a clear explanatory panel is shown instead of an empty
 * table — an empty table would wrongly imply "this guardian [nobody's
 * guardian yet] has no opt-outs," when really nothing has been searched at
 * all, per this part's own plan.
 *
 * The create-dialog trigger defaults its own `guardianId` field to whatever
 * is currently in this page's search box (if any) — reads more naturally
 * than always starting blank once a guardian is already in view, per
 * `create-optout-dialog.tsx`'s own doc comment on that choice.
 */
export default function OptoutsPage() {
  const t = useTranslations("communications.optouts");
  const [searchDraft, setSearchDraft] = React.useState("");
  const [guardianId, setGuardianId] = React.useState<string | undefined>(undefined);
  const [searchError, setSearchError] = React.useState<string | null>(null);

  const query = useOptoutsByGuardian(guardianId);

  function handleSearch() {
    const trimmed = searchDraft.trim();
    if (!UUID_PATTERN.test(trimmed)) {
      setSearchError(t("invalidGuardianId"));
      setGuardianId(undefined);
      return;
    }
    setSearchError(null);
    setGuardianId(trimmed);
  }

  const columns = React.useMemo<ColumnDef<OptoutResponseDto>[]>(
    () => [
      { id: "channel", header: t("columns.channel"), cell: ({ row }) => <ChannelBadge channel={row.original.channel} /> },
      { accessorKey: "scope", header: t("columns.scope") },
      { id: "createdAt", header: t("columns.createdAt"), cell: ({ row }) => new Date(row.original.createdAt).toLocaleString() },
      {
        id: "actions",
        header: t("columns.actions"),
        cell: ({ row }) => <DeleteOptoutButton optout={row.original} />,
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
        <CreateOptoutDialog defaultGuardianId={searchDraft.trim() || undefined} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("searchLabel")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-1.5 sm:w-96">
              <Input
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                placeholder={t("searchPlaceholder")}
              />
            </div>
            <Button type="button" onClick={handleSearch}>
              <Search className="size-4" />
              {t("searchButton")}
            </Button>
          </div>
          {searchError && <p className="mt-2 text-sm text-destructive">{searchError}</p>}
        </CardContent>
      </Card>

      {!guardianId ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{t("noSearchYet")}</CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
            <CardDescription>{t("listDescription", { guardianId })}</CardDescription>
          </CardHeader>
          <CardContent>
            <QueryBoundary query={query} isEmpty={(d) => d.length === 0}>
              {(optouts) =>
                optouts.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">{t("noOptoutsForGuardian")}</p>
                ) : (
                  <DataTable columns={columns} data={optouts} />
                )
              }
            </QueryBoundary>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

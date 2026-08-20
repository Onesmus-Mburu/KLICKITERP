"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Barcode, Eye, Search, X } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { FaAssetResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ApiError } from "@/lib/api-error";
import { useCategories } from "@/features/fixed-assets/hooks/use-categories";
import { useAssetByBarcode, useAssets, useAssetSearch } from "@/features/fixed-assets/hooks/use-assets";
import { useUsersLookup } from "@/features/fixed-assets/hooks/use-users-lookup";
import { CreateAssetDialog } from "@/features/fixed-assets/components/create-asset-dialog";

const ALL_SENTINEL = "__all__";
const FA_ASSET_STATUSES = ["ACTIVE", "UNDER_MAINTENANCE", "TRANSFERRED", "DISPOSED", "WRITTEN_OFF"] as const;

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  ACTIVE: "soft-success",
  UNDER_MAINTENANCE: "soft-warning",
  TRANSFERRED: "soft-secondary",
  DISPOSED: "soft-destructive",
  WRITTEN_OFF: "soft-destructive",
};

/**
 * Phase 6 Slice 23 Part 1 (Fixed Assets foundations, Module 17) — the asset
 * register list: a debounced code/barcode search box (`GET .../search`, real
 * substring `ILIKE` on `code`/`barcode` ONLY — confirmed by reading
 * `FaAssetRepository.searchByCodeOrBarcode()` directly, NOT a name search,
 * so the search box is labeled accordingly, not a generic "search assets"
 * that would imply name matching works) + `categoryId`/`status`/
 * `custodianUserId` `<Select>` filters (real server-side query params) +
 * `<DataTable>` inside `<QueryBoundary>` + a separate exact-match barcode
 * lookup panel — the same "search vs. filtered list, only one query enabled
 * at a time" shape `payroll/employees/page.tsx` already establishes, plus
 * one more real, separate endpoint this page also exposes.
 *
 * **`fixed-assets:asset:view` covers this whole page** (list/search/barcode
 * lookup); create/edit/condition-update need the narrower
 * `fixed-assets:asset:manage` — no page-level role-name gating, the create
 * button is always rendered and a role missing `:manage` gets a real `403`
 * surfaced via `ApiError.message` on the dialog's own submit, the same "the
 * 403 IS the enforcement" precedent every other `:view`/`:manage`-split page
 * in this codebase follows.
 *
 * **Barcode lookup is a genuinely separate real endpoint**
 * (`GET .../barcode/:barcode`), not a client-side filter over the search
 * results — `useAssetByBarcode()` throws a real `ApiError` with `status ===
 * 404` when nothing matches (confirmed by reading `AssetsController.findByBarcode()`
 * directly: a real `NotFoundException`, not an empty 200), and this panel
 * treats that 404 as a genuine "no asset found" resting state, never an
 * error toast.
 */
export default function FixedAssetsPage() {
  const t = useTranslations("fixedAssets.assets.list");
  const tStatuses = useTranslations("fixedAssets.assetStatuses");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const categoriesQuery = useCategories();
  const usersQuery = useUsersLookup();

  const [categoryId, setCategoryId] = React.useState("");
  const [status, setStatus] = React.useState<(typeof FA_ASSET_STATUSES)[number] | "">("");
  const [custodianUserId, setCustodianUserId] = React.useState("");
  const [searchDraft, setSearchDraft] = React.useState("");
  const debouncedSearch = useDebouncedValue(searchDraft, 300).trim();
  const isSearching = debouncedSearch.length > 0;

  const [barcodeDraft, setBarcodeDraft] = React.useState("");
  const [submittedBarcode, setSubmittedBarcode] = React.useState("");

  const listQuery = useAssets(
    { categoryId: categoryId || undefined, status: status || undefined, custodianUserId: custodianUserId || undefined },
    { enabled: !isSearching },
  );
  const searchQuery = useAssetSearch(debouncedSearch, { enabled: isSearching });
  const activeQuery = isSearching ? searchQuery : listQuery;
  const barcodeQuery = useAssetByBarcode(submittedBarcode, { enabled: submittedBarcode.length > 0 });

  const categoryNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categoriesQuery.data ?? []) map.set(c.id, c.name);
    return map;
  }, [categoriesQuery.data]);

  const userNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const u of usersQuery.data?.items ?? []) map.set(u.id, u.fullName);
    return map;
  }, [usersQuery.data]);

  const columns = React.useMemo<ColumnDef<FaAssetResponseDto>[]>(
    () => [
      { accessorKey: "code", header: t("columns.code") },
      { accessorKey: "name", header: t("columns.name") },
      { id: "category", header: t("columns.category"), cell: ({ row }) => categoryNameById.get(row.original.categoryId) ?? "—" },
      { accessorKey: "location", header: t("columns.location") },
      {
        id: "custodian",
        header: t("columns.custodian"),
        cell: ({ row }) => (row.original.custodianUserId ? (userNameById.get(row.original.custodianUserId) ?? "—") : "—"),
      },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => <Badge variant={STATUS_BADGE_VARIANT[row.original.status] ?? "outline"}>{tStatuses(row.original.status)}</Badge>,
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
              router.push(`/fixed-assets/assets/${row.original.id}`);
            }}
          >
            <Eye className="size-4" />
            {tCommon("view")}
          </Button>
        ),
      },
    ],
    [t, tStatuses, categoryNameById, userNameById, tCommon, router],
  );

  const hasFilters = categoryId !== "" || status !== "" || custodianUserId !== "";

  const barcodeNotFound = barcodeQuery.isError && barcodeQuery.error instanceof ApiError && barcodeQuery.error.status === 404;
  const barcodeOtherError = barcodeQuery.isError && !barcodeNotFound;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateAssetDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-foreground">
            <Barcode className="size-4" />
            {t("barcodeLookup.title")}
          </CardTitle>
          <CardDescription>{t("barcodeLookup.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5 sm:w-72">
              <Label>{t("barcodeLookup.inputLabel")}</Label>
              <Input value={barcodeDraft} onChange={(e) => setBarcodeDraft(e.target.value)} placeholder={t("barcodeLookup.inputPlaceholder")} />
            </div>
            <Button type="button" variant="outline" onClick={() => setSubmittedBarcode(barcodeDraft.trim())} disabled={!barcodeDraft.trim()}>
              {t("barcodeLookup.lookupButton")}
            </Button>
          </div>

          {submittedBarcode.length > 0 && barcodeQuery.isFetching && (
            <p className="text-sm text-muted-foreground">{t("barcodeLookup.searching")}</p>
          )}
          {barcodeQuery.data && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {barcodeQuery.data.code} — {barcodeQuery.data.name}
                </p>
                <p className="text-xs text-muted-foreground">{t("barcodeLookup.foundHint")}</p>
              </div>
              <Button type="button" size="sm" onClick={() => router.push(`/fixed-assets/assets/${barcodeQuery.data!.id}`)}>
                {t("barcodeLookup.viewButton")}
              </Button>
            </div>
          )}
          {barcodeNotFound && <p className="text-sm text-muted-foreground">{t("barcodeLookup.notFound", { barcode: submittedBarcode })}</p>}
          {barcodeOtherError && <p className="text-sm text-destructive">{t("barcodeLookup.genericError")}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>{t("searchLabel")}</Label>
              <div className="relative sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder={t("searchPlaceholder")} value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} />
              </div>
            </div>
            <div className="w-56 space-y-1.5">
              <Label>{t("filters.categoryLabel")}</Label>
              <Select value={categoryId || ALL_SENTINEL} onValueChange={(v) => setCategoryId(v === ALL_SENTINEL ? "" : v)} disabled={isSearching}>
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allCategories")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allCategories")}</SelectItem>
                  {(categoriesQuery.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-48 space-y-1.5">
              <Label>{t("filters.statusLabel")}</Label>
              <Select
                value={status || ALL_SENTINEL}
                onValueChange={(v) => setStatus(v === ALL_SENTINEL ? "" : (v as (typeof FA_ASSET_STATUSES)[number]))}
                disabled={isSearching}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allStatuses")}</SelectItem>
                  {FA_ASSET_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {tStatuses(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-56 space-y-1.5">
              <Label>{t("filters.custodianLabel")}</Label>
              <Select
                value={custodianUserId || ALL_SENTINEL}
                onValueChange={(v) => setCustodianUserId(v === ALL_SENTINEL ? "" : v)}
                disabled={isSearching}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allCustodians")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allCustodians")}</SelectItem>
                  {(usersQuery.data?.items ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCategoryId("");
                  setStatus("");
                  setCustodianUserId("");
                }}
              >
                <X className="size-4" />
                {t("filters.clearFilters")}
              </Button>
            )}
          </div>

          <QueryBoundary query={activeQuery} isEmpty={(d) => d.length === 0}>
            {(assets) =>
              assets.length === 0 && isSearching ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("noAssetsMatchSearch")}</p>
              ) : (
                <DataTable columns={columns} data={assets} onRowClick={(asset) => router.push(`/fixed-assets/assets/${asset.id}`)} />
              )
            }
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}

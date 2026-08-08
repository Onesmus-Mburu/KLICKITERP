"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { WalletListItemResponseDto } from "@klickit/contracts";
import { Input } from "@/components/ui/input";
import { DataTable, type ServerPaginationState } from "@/components/patterns/data-table";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useWallets } from "../hooks/use-wallets";
import { WalletStatusBadge } from "./wallet-status-badge";

const DEFAULT_PAGE_SIZE = 10;
/** Same "only fire once 2+ characters are typed" convention Slice 9 (Part B) established for Pending/Upcoming/Receipts. */
const MIN_SEARCH_LENGTH = 2;

function LimitCell({ value }: { value: string | null }) {
  return <span>{value === null ? "—" : formatMoney(value)}</span>;
}

/**
 * Phase 6 Slice 11 (Part 2) — the new Wallets list screen. Same
 * `<DataTable serverPagination>` + debounced search-box shape
 * `OpenInvoicesTable` (`features/billing/components/open-invoices-table.tsx`,
 * Slice 8 Part 2 / Slice 9 Part B) already established — owns its own
 * page/pageSize/search-draft state, resets to page 1 on a genuinely new
 * search term.
 */
export function WalletsTable() {
  const t = useTranslations("wallet.list");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const [searchDraft, setSearchDraft] = React.useState("");
  const debouncedSearch = useDebouncedValue(searchDraft, 300);
  const trimmedSearch = debouncedSearch.trim();
  const q = trimmedSearch.length >= MIN_SEARCH_LENGTH ? trimmedSearch : undefined;

  React.useEffect(() => {
    setPage(1);
  }, [q]);

  const query = useWallets({ page, pageSize, q });

  const columns = React.useMemo<ColumnDef<WalletListItemResponseDto>[]>(
    () => [
      {
        id: "student",
        header: t("columns.student"),
        cell: ({ row }) => (
          <Link href={`/wallet/${row.original.id}`} className="font-medium text-brand-primary hover:underline">
            {row.original.studentName}
            <span className="ml-1 text-xs text-muted-foreground">({row.original.admissionNo})</span>
          </Link>
        ),
      },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => <WalletStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "balance",
        header: t("columns.balance"),
        cell: ({ getValue }) => <span className="font-medium">{formatMoney(getValue<string>())}</span>,
      },
      {
        accessorKey: "overdraftLimit",
        header: t("columns.overdraftLimit"),
        cell: ({ getValue }) => formatMoney(getValue<string>()),
      },
      {
        accessorKey: "dailyLimit",
        header: t("columns.dailyLimit"),
        cell: ({ getValue }) => <LimitCell value={getValue<string | null>()} />,
      },
      {
        accessorKey: "txnLimit",
        header: t("columns.txnLimit"),
        cell: ({ getValue }) => <LimitCell value={getValue<string | null>()} />,
      },
    ],
    [t],
  );

  const total = query.data?.total ?? 0;
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

  return (
    <div className="space-y-4">
      <div className="relative sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={t("searchPlaceholder")}
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
        />
      </div>
      <QueryBoundary query={query} isEmpty={(d) => d.items.length === 0}>
        {(data) => <DataTable columns={columns} data={data.items} serverPagination={serverPagination} />}
      </QueryBoundary>
    </div>
  );
}

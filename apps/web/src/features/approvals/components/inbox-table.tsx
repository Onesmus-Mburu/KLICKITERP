"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import type { Instance } from "../types";
import { EntityLabel } from "./entity-label";
import { InstanceStatusBadge } from "./status-badges";
import { UserName } from "./user-name";

/** `GET /approvals/instances/inbox`'s result rendered as a `<DataTable>` — bare unbounded array (no pagination on `InstancesController.inbox()`), matching every other bare-array list this codebase already builds `<DataTable>` client-side pagination against (e.g. `ReceiptsTable`). */
export function InboxTable({ instances }: { instances: Instance[] }) {
  const t = useTranslations("approvals.inbox.table");

  const columns: ColumnDef<Instance>[] = [
    { accessorKey: "domainCode", header: t("domain") },
    {
      id: "entity",
      header: t("entity"),
      cell: ({ row }) => <EntityLabel entityType={row.original.entityType} entityId={row.original.entityId} />,
    },
    {
      accessorKey: "amount",
      header: t("amount"),
      cell: ({ row }) => (row.original.amount ? formatMoney(row.original.amount) : "—"),
    },
    {
      id: "initiator",
      header: t("initiator"),
      cell: ({ row }) => <UserName id={row.original.initiatorId} />,
    },
    {
      accessorKey: "submittedAt",
      header: t("submitted"),
      cell: ({ row }) => new Date(row.original.submittedAt).toLocaleString(),
    },
    {
      id: "status",
      header: t("status"),
      cell: ({ row }) => <InstanceStatusBadge status={row.original.status} />,
    },
    {
      id: "review",
      header: "",
      cell: ({ row }) => (
        <Link href={`/approvals/instances/${row.original.id}`} className="text-primary hover:underline">
          {t("review")}
        </Link>
      ),
    },
  ];

  return <DataTable columns={columns} data={instances} />;
}

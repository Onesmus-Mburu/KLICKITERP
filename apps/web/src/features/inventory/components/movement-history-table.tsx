"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { formatCost, formatQty } from "../lib/decimal-qty";
import type { Movement } from "../api/stock-movements.api";

const MOVEMENT_TYPE_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  RECEIPT: "soft-success",
  ISSUE: "soft-warning",
  SALE: "soft-primary",
  TRANSFER_OUT: "soft-destructive",
  TRANSFER_IN: "soft-success",
  ADJUSTMENT: "soft-secondary",
  RETURN: "soft-accent",
};

/**
 * Phase 6 Slice 19 Part 2 (Stock Movements + Transfers, Module 13) — a
 * reusable `inv_movement` ledger table (`MovementResponseDto[]`, most-recent
 * first as the API itself already returns it — no client-side re-sort). Shows
 * all 7 `movementType` values (RECEIPT/ISSUE/SALE/TRANSFER_OUT/TRANSFER_IN/
 * ADJUSTMENT/RETURN) even though only ISSUE is creatable from this feature's
 * own `<IssueStockDialog>` — Transfers (this same part) and Stock Takes
 * (Part 3, not built yet) create the rest, and a real (item, store) pair's
 * history can legitimately include any of them.
 *
 * `qty`/`value` are SIGNED decimal strings (a negative `qty` for an outbound
 * movement) — `formatQty()`/`formatMoney()` both already handle a leading
 * `-` correctly (confirmed by reading `lib/decimal-qty.ts`/`lib/money.ts`
 * directly), so no extra sign-handling is needed here. `unitCost` uses
 * `formatCost()` (6dp) per this module's own established precision split —
 * `value` is the one genuinely `Money`-typed field on `MovementResponseDto`
 * (scale 4) and uses `formatMoney()` instead, NOT `formatCost()`, matching
 * this part's own explicit instruction.
 *
 * `at` is rendered via `new Date(movement.at)` — `movement.at` is honestly
 * typed `string` here (`stock-movements.api.ts`'s own `Movement` type
 * override), never trusted as an already-parsed `Date`, see that file's own
 * doc comment for the real codegen gap this works around.
 *
 * `departmentLabelById` is an OPTIONAL caller-supplied lookup (the page
 * composing this table already fetches the department list for
 * `<IssueStockDialog>`'s own picker, so passing that same map through avoids
 * a second, redundant `useDepartments()` call inside this shared component) —
 * falls back to the raw uuid when omitted or when a movement's
 * `departmentId` isn't found in it (e.g. a department deleted after the
 * movement was recorded — no delete route exists for departments today, but
 * this stays defensive regardless).
 */
export function MovementHistoryTable({ movements, departmentLabelById }: { movements: Movement[]; departmentLabelById?: Map<string, string> }) {
  const t = useTranslations("inventory.stockMovements");
  const tTypes = useTranslations("inventory.stockMovements.movementTypes");

  const columns = React.useMemo<ColumnDef<Movement>[]>(
    () => [
      { id: "at", header: t("columns.at"), cell: ({ row }) => new Date(row.original.at).toLocaleString() },
      {
        id: "movementType",
        header: t("columns.movementType"),
        cell: ({ row }) => <Badge variant={MOVEMENT_TYPE_BADGE_VARIANT[row.original.movementType] ?? "outline"}>{tTypes(row.original.movementType)}</Badge>,
      },
      { id: "qty", header: t("columns.qty"), cell: ({ row }) => formatQty(row.original.qty) },
      { id: "unitCost", header: t("columns.unitCost"), cell: ({ row }) => formatCost(row.original.unitCost) },
      { id: "value", header: t("columns.value"), cell: ({ row }) => formatMoney(row.original.value) },
      { accessorKey: "refDocType", header: t("columns.refDocType") },
      {
        id: "department",
        header: t("columns.department"),
        cell: ({ row }) =>
          row.original.departmentId ? (departmentLabelById?.get(row.original.departmentId) ?? row.original.departmentId) : "—",
      },
    ],
    [t, tTypes, departmentLabelById],
  );

  return <DataTable columns={columns} data={movements} />;
}

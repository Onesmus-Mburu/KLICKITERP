"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { StudentResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useClasses } from "../hooks/use-classes";

export const STATUS_BADGE_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  ACTIVE: "soft-success",
  SUSPENDED: "soft-warning",
  ALUMNI: "soft-secondary",
  TRANSFERRED: "soft-secondary",
  WITHDRAWN: "soft-destructive",
};

/**
 * `DataTable`'s `ColumnDef<StudentResponseDto>[]` — a hook (not a plain
 * exported array) because column headers/cell labels need `useTranslations`
 * and the class-name cell needs `useClasses()`'s already-fetched list (the
 * SAME query `<ClassStreamSelect>`'s filter row uses — TanStack Query dedupes
 * it, no extra HTTP call). Stream is deliberately NOT a list column: `GET
 * /students/streams` requires `?classId=` (no "list all streams" endpoint
 * exists anywhere in this domain, confirmed against `streams.controller.ts`),
 * so cheaply resolving stream NAMES for a table whose rows can span many
 * different classes at once isn't a single extra query the way class names
 * are — a deliberate, narrow scope trim; the student detail page (which
 * already knows the ONE relevant classId) shows the real stream name there.
 */
export function useStudentColumns(): ColumnDef<StudentResponseDto>[] {
  const t = useTranslations("students.list");
  const tStatus = useTranslations("students.status");
  const tBoarding = useTranslations("students.boarding");
  const tCommon = useTranslations("common");
  const classesQuery = useClasses();

  const classNameById = React.useMemo(() => new Map((classesQuery.data ?? []).map((klass) => [klass.id, klass.name])), [classesQuery.data]);

  return React.useMemo<ColumnDef<StudentResponseDto>[]>(
    () => [
      { accessorKey: "admissionNo", header: t("admissionNo") },
      {
        id: "name",
        header: t("name"),
        cell: ({ row }) => `${row.original.firstName}${row.original.middleName ? ` ${row.original.middleName}` : ""} ${row.original.lastName}`,
      },
      {
        id: "class",
        header: t("class"),
        cell: ({ row }) => classNameById.get(row.original.classId) ?? "—",
      },
      {
        accessorKey: "boarding",
        header: t("boarding"),
        cell: ({ getValue }) => tBoarding(getValue<string>()),
      },
      {
        accessorKey: "status",
        header: t("status"),
        cell: ({ getValue }) => {
          const status = getValue<string>();
          return <Badge variant={STATUS_BADGE_VARIANT[status] ?? "outline"}>{tStatus(status)}</Badge>;
        },
      },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <Button asChild size="sm" variant="outline">
            <Link href={`/students/${row.original.id}`}>{t("viewDetails")}</Link>
          </Button>
        ),
      },
    ],
    [classNameById, t, tBoarding, tCommon, tStatus],
  );
}

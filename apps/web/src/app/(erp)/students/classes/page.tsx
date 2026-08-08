"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { ClassResponseDto, StreamResponseDto } from "@klickit/contracts";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useClasses } from "@/features/students/hooks/use-classes";
import { useStreamsForClass } from "@/features/students/hooks/use-streams";
import { ClassDialog } from "@/features/students/components/class-dialog";
import { StreamDialog } from "@/features/students/components/stream-dialog";
import { AdmissionNoAutogenPanel } from "@/features/students/components/admission-no-autogen-panel";
import { DeleteClassButton } from "@/features/students/components/delete-class-button";
import { DeleteStreamButton } from "@/features/students/components/delete-stream-button";

/**
 * Phase 6 Slice 2b item 6 — Classes & Streams management page. Reuses the
 * exact same `DataTable`/`Dialog`/plain-controlled-form patterns the
 * Students module itself already established (`student-form.tsx`,
 * `guardian-link-dialog.tsx`) rather than inventing new ones —
 * `ClassesController`/`StreamsController`'s CRUD endpoints already existed
 * server-side (confirmed by reading both controllers before this pass);
 * only the frontend was missing. Also hosts item 8's Admission Number
 * Settings panel — a natural fit on the same "school structure config"
 * page, per the plan's own suggestion.
 */
export default function ClassesAndStreamsPage() {
  const t = useTranslations("students.classesPage");
  const tCommon = useTranslations("common");

  const classesQuery = useClasses();
  const [selectedClassId, setSelectedClassId] = React.useState<string | null>(null);
  const streamsQuery = useStreamsForClass(selectedClassId);

  const [classDialogMode, setClassDialogMode] = React.useState<"create" | "edit">("create");
  const [classDialogOpen, setClassDialogOpen] = React.useState(false);
  const [editingClass, setEditingClass] = React.useState<ClassResponseDto | undefined>(undefined);

  const [streamDialogMode, setStreamDialogMode] = React.useState<"create" | "edit">("create");
  const [streamDialogOpen, setStreamDialogOpen] = React.useState(false);
  const [editingStream, setEditingStream] = React.useState<StreamResponseDto | undefined>(undefined);

  // Auto-select the first class once the list loads, so the Streams section
  // has something to show without an extra click on first visit.
  React.useEffect(() => {
    if (!selectedClassId && classesQuery.data && classesQuery.data.length > 0) {
      setSelectedClassId(classesQuery.data[0].id);
    }
  }, [classesQuery.data, selectedClassId]);

  const classColumns = React.useMemo<ColumnDef<ClassResponseDto>[]>(
    () => [
      { accessorKey: "name", header: t("classTable.name") },
      { accessorKey: "level", header: t("classTable.level") },
      {
        id: "isActive",
        header: t("classTable.isActive"),
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "soft-success" : "soft-destructive"}>
            {row.original.isActive ? tCommon("active") : tCommon("inactive")}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditingClass(row.original);
                setClassDialogMode("edit");
                setClassDialogOpen(true);
              }}
            >
              <Pencil className="size-4" />
              {tCommon("edit")}
            </Button>
            <DeleteClassButton classItem={row.original} />
          </div>
        ),
      },
    ],
    [t, tCommon],
  );

  const streamColumns = React.useMemo<ColumnDef<StreamResponseDto>[]>(
    () => [
      { accessorKey: "name", header: t("streamTable.name") },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditingStream(row.original);
                setStreamDialogMode("edit");
                setStreamDialogOpen(true);
              }}
            >
              <Pencil className="size-4" />
              {tCommon("edit")}
            </Button>
            {selectedClassId && <DeleteStreamButton classId={selectedClassId} streamItem={row.original} />}
          </div>
        ),
      },
    ],
    [t, tCommon, selectedClassId],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <AdmissionNoAutogenPanel />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base text-foreground">{t("classesTitle")}</CardTitle>
          <Button
            size="sm"
            onClick={() => {
              setEditingClass(undefined);
              setClassDialogMode("create");
              setClassDialogOpen(true);
            }}
          >
            <Plus className="size-4" />
            {t("newClass")}
          </Button>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={classesQuery} isEmpty={(d) => d.length === 0}>
            {(data) => <DataTable columns={classColumns} data={data} />}
          </QueryBoundary>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base text-foreground">{t("streamsTitle")}</CardTitle>
            <Select value={selectedClassId ?? undefined} onValueChange={setSelectedClassId}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder={t("selectClassForStreams")} />
              </SelectTrigger>
              <SelectContent>
                {classesQuery.data?.map((klass) => (
                  <SelectItem key={klass.id} value={klass.id}>
                    {klass.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            disabled={!selectedClassId}
            onClick={() => {
              setEditingStream(undefined);
              setStreamDialogMode("create");
              setStreamDialogOpen(true);
            }}
          >
            <Plus className="size-4" />
            {t("newStream")}
          </Button>
        </CardHeader>
        <CardContent>
          {selectedClassId ? (
            <QueryBoundary query={streamsQuery} isEmpty={(d) => d.length === 0}>
              {(data) => <DataTable columns={streamColumns} data={data} />}
            </QueryBoundary>
          ) : (
            <p className="text-sm text-muted-foreground">{t("selectClassForStreams")}</p>
          )}
        </CardContent>
      </Card>

      <ClassDialog mode={classDialogMode} classItem={editingClass} open={classDialogOpen} onOpenChange={setClassDialogOpen} />
      {selectedClassId && (
        <StreamDialog
          classId={selectedClassId}
          mode={streamDialogMode}
          streamItem={editingStream}
          open={streamDialogOpen}
          onOpenChange={setStreamDialogOpen}
        />
      )}
    </div>
  );
}

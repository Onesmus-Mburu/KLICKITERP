"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Pencil, Star, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { ApiError } from "@/lib/api-error";
import { useGuardian, useGuardianStudentLinks, useUnlinkStudentFromGuardian } from "@/features/students/hooks/use-guardians";
import { GuardianDialog } from "@/features/students/components/guardian-dialog";
import { LinkStudentDialog } from "@/features/students/components/link-student-dialog";

/**
 * A guardian's own detail page — profile (edit) + linked children (the
 * reverse of `guardian-section.tsx`'s per-student widget). `missingAssetIds`-
 * style derivation isn't needed here — `useGuardianStudentLinks()` already
 * returns the joined, display-ready shape directly from the real
 * `GET /students/guardians/{id}/students` route (see that hook's own doc
 * comment for why a `useQueries` join, not a bulk-list join, is correct
 * here).
 */
export default function GuardianDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("students.guardiansPage.detail");
  const guardianQuery = useGuardian(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/students/guardians">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={guardianQuery}>{(guardian) => <GuardianDetailContent guardianId={guardian.id} />}</QueryBoundary>
    </div>
  );
}

function GuardianDetailContent({ guardianId }: { guardianId: string }) {
  const t = useTranslations("students.guardiansPage.detail");
  const guardianQuery = useGuardian(guardianId);
  const linksQuery = useGuardianStudentLinks(guardianId);
  const unlinkMutation = useUnlinkStudentFromGuardian(guardianId);
  const [editOpen, setEditOpen] = React.useState(false);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [unlinkError, setUnlinkError] = React.useState<string | null>(null);

  const guardian = guardianQuery.data;

  async function handleUnlink(studentId: string) {
    setUnlinkError(null);
    try {
      await unlinkMutation.mutateAsync(studentId);
    } catch (err) {
      setUnlinkError(err instanceof ApiError ? err.message : t("unlinkError"));
    }
  }

  if (!guardian) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base text-foreground">{guardian.fullName}</CardTitle>
            <CardDescription>
              {guardian.phone ?? "—"}
              {guardian.phone && guardian.email ? ` · ${guardian.email}` : (guardian.email ?? "")}
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            {t("editButton")}
          </Button>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <DetailField label={t("phoneLabel")} value={guardian.phone ?? "—"} />
            <DetailField label={t("emailLabel")} value={guardian.email ?? "—"} />
            <DetailField label={t("nationalIdLabel")} value={guardian.nationalId ?? "—"} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base text-foreground">{t("linkedStudentsTitle")}</CardTitle>
          <Button size="sm" onClick={() => setLinkOpen(true)}>
            <UserPlus className="size-4" />
            {t("linkStudent")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {unlinkError && <p className="text-xs text-destructive">{unlinkError}</p>}
          <QueryBoundary query={linksQuery}>
            {(rows) => (
              <ul className="space-y-2">
                {rows.map(({ link, student }) => (
                  <li key={link.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                    <div>
                      <Link href={`/students/${link.studentId}`} className="flex items-center gap-2 text-sm font-medium text-foreground hover:underline">
                        {student ? `${student.firstName} ${student.lastName}` : "—"}
                        {link.isPrimary && (
                          <Badge variant="soft-primary">
                            <Star className="mr-1 size-3" />
                            {t("primary")}
                          </Badge>
                        )}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {student?.admissionNo ?? "—"} · {link.relationship}
                        {link.receivesBilling ? ` · ${t("receivesBilling")}` : ""}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => handleUnlink(link.studentId)} disabled={unlinkMutation.isPending}>
                      <Trash2 className="size-4" />
                      {t("unlink")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </QueryBoundary>
        </CardContent>
      </Card>

      <GuardianDialog mode="edit" guardian={guardian} open={editOpen} onOpenChange={setEditOpen} />
      <LinkStudentDialog guardianId={guardianId} open={linkOpen} onOpenChange={setLinkOpen} />
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

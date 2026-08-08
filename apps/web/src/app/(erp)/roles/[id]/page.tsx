"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useRole } from "@/features/roles/hooks/use-roles";
import { useRolePermissionsForModule } from "@/features/roles/hooks/use-role-permissions";
import { EditRoleDialog } from "@/features/roles/components/edit-role-dialog";
import { RoleBadges } from "@/features/roles/components/role-badges";
import { RolePermissionsTable } from "@/features/roles/components/role-permissions-table";
import { PERMISSION_MODULES } from "@/features/roles/constants";

/**
 * Phase 6 Slice 13 Part 2 — the Role detail page: a header `Card`
 * (name/description/badges, editable via the same `<EditRoleDialog>` the
 * list page uses) plus a module `<Select>`-driven, scoped permission
 * grant/revoke table — direct reuse of `settings/academic-calendar/page.tsx`'s
 * proven "Select filters a scoped sub-table" shape (read first as the cited
 * precedent), not a new Accordion primitive.
 *
 * **Judgment call — module-select default state**: defaults to the FIRST
 * module alphabetically (`PERMISSION_MODULES[0]`, "accounting") rather than
 * an empty "select a module first" placeholder state. Unlike Academic
 * Calendar's year `<Select>` (whose options come from an async query and
 * genuinely might not have loaded/existed yet), `PERMISSION_MODULES` is a
 * fixed, always-available 24-entry client-side list — there's no "wait for
 * data before a default makes sense" reason to leave the table empty on
 * first paint, and landing on real content beats an extra required click.
 */
export default function RoleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("roles");
  const roleQuery = useRole(id);
  const [selectedModule, setSelectedModule] = React.useState<string>(PERMISSION_MODULES[0]);
  const permissionsQuery = useRolePermissionsForModule(id, selectedModule);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/roles">
          <ArrowLeft className="size-4" />
          {t("detail.backToList")}
        </Link>
      </Button>

      <QueryBoundary query={roleQuery}>
        {(role) => (
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <div className="space-y-1.5">
                <CardTitle className="text-base text-foreground">{role.name}</CardTitle>
                {role.description && <CardDescription>{role.description}</CardDescription>}
                <RoleBadges role={role} />
              </div>
              <EditRoleDialog role={role} />
            </CardHeader>
          </Card>
        )}
      </QueryBoundary>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("detail.permissionsListTitle")}</CardTitle>
          <CardDescription>{t("detail.permissionsListDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-1.5">
            <Label>{t("detail.moduleSelectLabel")}</Label>
            <Select value={selectedModule} onValueChange={setSelectedModule}>
              <SelectTrigger>
                <SelectValue placeholder={t("detail.moduleSelectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {PERMISSION_MODULES.map((moduleValue) => (
                  <SelectItem key={moduleValue} value={moduleValue}>
                    {t(`modules.${moduleValue}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <QueryBoundary query={permissionsQuery} isEmpty={(d) => d.length === 0}>
            {(rows) => <RolePermissionsTable roleId={id} rows={rows} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { RoleResponseDto } from "@klickit/contracts";

/**
 * Visual-only flags — `isSystemTemplate` -> "System", `isAuditorClass` ->
 * "Auditor". Nothing server-side blocks editing a system-template role's
 * name/description via `<EditRoleDialog>` (no read-only enforcement exists
 * anywhere in `RolesController`/`RolesService`, confirmed by reading both) —
 * these badges exist purely so an admin doesn't rename/edit "System Admin"
 * or "Auditor" without realizing what they are, per the plan's own explicit
 * framing ("visually flags roles nothing server-side blocks editing").
 */
export function RoleBadges({ role }: { role: Pick<RoleResponseDto, "isSystemTemplate" | "isAuditorClass"> }) {
  const t = useTranslations("roles.badges");
  if (!role.isSystemTemplate && !role.isAuditorClass) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {role.isSystemTemplate && <Badge variant="soft-secondary">{t("system")}</Badge>}
      {role.isAuditorClass && <Badge variant="soft-warning">{t("auditor")}</Badge>}
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { useUser } from "@/features/users/hooks/use-users";
import { UserStatusBadge } from "@/features/users/components/user-status-badge";
import { UserStatusActions } from "@/features/users/components/user-status-action-button";
import { EditUserProfileDialog } from "@/features/users/components/edit-user-profile-dialog";
import { AssignDepartmentDialog } from "@/features/users/components/assign-department-dialog";
import { SetAuthorityLimitDialog } from "@/features/users/components/set-authority-limit-dialog";
import { UserRolesSection } from "@/features/users/components/user-roles-section";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

/**
 * Phase 6 Slice 13 Part 4 — the User detail page: a header `Card` with
 * dialog-trigger buttons in `CardHeader` (mirrors `wallet/[id]/page.tsx`) —
 * Edit Profile, Assign Department, Set Authority Limit — plus
 * `<UserStatusActions>`'s status-transition buttons computed from the
 * user's current status. Body grid: email/phone/userType/department/
 * authority-limit (formatted via `formatMoney`, "—" if null)/locale/
 * mustChangePassword+twofaEnabled badges/lastLoginAt/passwordChangedAt
 * (formatted dates, "—" for null `lastLoginAt`, mirroring the established
 * `new Date(x).toLocaleString()` inline convention this codebase already
 * uses everywhere — `webhook-deliveries-table.tsx`/`inbox-table.tsx`/etc. —
 * no shared date-format helper exists). Below: the Roles sub-table
 * (`UserRolesSection`).
 */
export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("users.detail");
  const tType = useTranslations("users.userType");
  const userQuery = useUser(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/users">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={userQuery}>
        {(user) => (
          <>
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                  <CardTitle className="text-base text-foreground">{user.username}</CardTitle>
                  <p className="text-xs text-muted-foreground">{user.id}</p>
                  <UserStatusBadge status={user.status} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <EditUserProfileDialog user={user} />
                  <AssignDepartmentDialog user={user} />
                  <SetAuthorityLimitDialog user={user} />
                  <UserStatusActions user={user} />
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field label={t("fullNameLabel")} value={user.fullName} />
                <Field label={t("emailLabel")} value={user.email ?? "—"} />
                <Field label={t("phoneLabel")} value={user.phone ?? "—"} />
                <Field label={t("userTypeLabel")} value={tType(user.userType)} />
                <Field label={t("departmentLabel")} value={user.departmentName ?? "—"} />
                <Field label={t("authorityLimitLabel")} value={user.authorityLimitAmount ? formatMoney(user.authorityLimitAmount) : "—"} />
                <Field label={t("localeLabel")} value={user.locale} />
                <div>
                  <p className="text-xs text-muted-foreground">{t("flagsLabel")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant={user.mustChangePassword ? "soft-warning" : "soft-secondary"}>
                      {user.mustChangePassword ? t("mustChangePasswordYes") : t("mustChangePasswordNo")}
                    </Badge>
                    <Badge variant={user.twofaEnabled ? "soft-success" : "soft-secondary"}>
                      {user.twofaEnabled ? t("twofaEnabledYes") : t("twofaEnabledNo")}
                    </Badge>
                  </div>
                </div>
                <Field label={t("lastLoginAtLabel")} value={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "—"} />
                <Field label={t("passwordChangedAtLabel")} value={new Date(user.passwordChangedAt).toLocaleString()} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base text-foreground">{t("rolesTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <UserRolesSection userId={user.id} />
              </CardContent>
            </Card>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}

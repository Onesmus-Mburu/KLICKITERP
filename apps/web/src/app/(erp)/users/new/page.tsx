"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { CreateUserResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { useDepartments } from "@/features/departments/hooks/use-departments";
import { useCreateUser } from "@/features/users/hooks/use-users";
import { TemporaryPasswordReveal } from "@/features/users/components/temporary-password-reveal";
import { LOCALE_OPTIONS, USER_TYPES, type UserType } from "@/features/users/constants";

const NO_DEPARTMENT_VALUE = "__none__";
const USERNAME_MAX_LENGTH = 60; // usr_user.username is varchar(60) — create-user.dto.ts.
const FULL_NAME_MAX_LENGTH = 120; // usr_user.full_name is varchar(120).
const EMAIL_MAX_LENGTH = 160; // usr_user.email is varchar(160).

/**
 * Phase 6 Slice 13 Part 4 — dedicated create page (mirrors `/students/new`'s
 * precedent: a back link + a `Card` wrapping a form), not a dialog — the
 * temp-password reveal deserves an unhurried, full-width moment, per the
 * plan. Two-phase, one component: the FORM phase (this page's own local
 * state) is replaced entirely by the REVEAL phase
 * (`<TemporaryPasswordReveal>`) on a successful `POST /users` — see that
 * component's own doc comment for the full reasoning behind its escalated
 * "no auto-navigation, explicit copy, explicit click-through" UX, the first
 * of its kind in this codebase.
 *
 * `ck_usr_user_contact_or_parent` (the real DB CHECK constraint, confirmed by
 * reading `usr-user.entity.ts`/migration `0010` directly: "user_type =
 * 'PARENT' OR phone IS NOT NULL OR email IS NOT NULL") is shown as a
 * client-side INLINE HINT only when `userType !== "PARENT"` and neither
 * contact field is filled — never a hard submit block, per the plan's
 * explicit instruction; the server 422s with a real, specific message if
 * violated anyway (`UsersService.create()`'s own defense-in-depth check
 * throws it first, ahead of the DB CHECK).
 */
export default function NewUserPage() {
  const t = useTranslations("users.newPage");
  const tUserType = useTranslations("users.userType");
  const tCommon = useTranslations("common");
  const departmentsQuery = useDepartments();
  const createMutation = useCreateUser();

  const [username, setUsername] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [userType, setUserType] = React.useState<UserType>("STAFF");
  const [departmentId, setDepartmentId] = React.useState(NO_DEPARTMENT_VALUE);
  const [locale, setLocale] = React.useState("en");
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<CreateUserResponseDto | null>(null);

  const canSubmit = username.trim().length > 0 && fullName.trim().length > 0;
  const showContactHint = userType !== "PARENT" && !email.trim() && !phone.trim();

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      const created = await createMutation.mutateAsync({
        username: username.trim(),
        fullName: fullName.trim(),
        userType,
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(departmentId !== NO_DEPARTMENT_VALUE ? { departmentId } : {}),
        locale,
      });
      // Held in local state ONLY — see `TemporaryPasswordReveal`'s own doc
      // comment on why the temp password is never persisted anywhere beyond
      // this one mutation's response.
      setResult(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  if (result) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("reveal.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <TemporaryPasswordReveal user={result.user} temporaryPassword={result.temporaryPassword} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/users">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("usernameLabel")}</Label>
              <Input value={username} maxLength={USERNAME_MAX_LENGTH} onChange={(e) => setUsername(e.target.value)} placeholder={t("usernamePlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("fullNameLabel")}</Label>
              <Input value={fullName} maxLength={FULL_NAME_MAX_LENGTH} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("emailLabel")}</Label>
              <Input type="email" value={email} maxLength={EMAIL_MAX_LENGTH} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("phoneLabel")}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("phonePlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("userTypeLabel")}</Label>
              <Select value={userType} onValueChange={(v) => setUserType(v as UserType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_TYPES.map((ut) => (
                    <SelectItem key={ut} value={ut}>
                      {tUserType(ut)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("departmentLabel")}</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger>
                  <SelectValue placeholder={departmentsQuery.isLoading ? t("loadingDepartments") : t("noDepartment")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_DEPARTMENT_VALUE}>{t("noDepartment")}</SelectItem>
                  {(departmentsQuery.data ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("localeLabel")}</Label>
              <Select value={locale} onValueChange={setLocale}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCALE_OPTIONS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {t(`localeOptions.${l}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {showContactHint && (
            <Alert variant="warning">
              <AlertDescription>{t("contactHint")}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button asChild variant="outline">
              <Link href="/users">{tCommon("cancel")}</Link>
            </Button>
            <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || createMutation.isPending}>
              {createMutation.isPending ? t("creating") : t("createButton")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

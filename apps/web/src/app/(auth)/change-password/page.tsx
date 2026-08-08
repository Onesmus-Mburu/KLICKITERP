"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChangePasswordDtoSchema } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Reveal } from "@/components/patterns/reveal";
import { useChangePassword } from "@/hooks/use-auth";
import { useAuthStore } from "@/lib/auth-store";

/**
 * FORCED password-change screen. Per docs/phase-6/PROGRESS.md's honest
 * scope note (matching `tools/README.md`'s own "Honest, known gap" section
 * verbatim): `mustChangePassword` is surfaced by the login response but
 * enforced by NOTHING server-side — no guard anywhere in `packages/server`
 * actually blocks a user who ignores it from calling other endpoints with
 * their still-temporary password. This screen is a UX nudge, not a real
 * security boundary; the note below says so out loud rather than implying
 * otherwise.
 */
export default function ChangePasswordPage() {
  const t = useTranslations("auth.changePassword");
  const router = useRouter();
  const mutation = useChangePassword();
  const setMustChangePassword = useAuthStore((s) => s.setMustChangePassword);

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (newPassword !== confirmPassword) {
      setFormError(t("mismatch"));
      return;
    }
    const parsed = ChangePasswordDtoSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) {
      setFormError(t("tooShort"));
      return;
    }

    try {
      await mutation.mutateAsync(parsed.data);
      setMustChangePassword(false);
      setSuccess(true);
      setTimeout(() => router.push("/dashboard"), 1200);
    } catch {
      setFormError(t("tooShort"));
    }
  }

  return (
    <Reveal>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-foreground">{t("title")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Alert variant="warning">
            <AlertDescription>{t("securityNote")}</AlertDescription>
          </Alert>
          {success ? (
            <Alert>
              <AlertDescription>{t("success")}</AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {formError && (
                <Alert variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="currentPassword">{t("currentPasswordLabel")}</Label>
                <Input id="currentPassword" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">{t("newPasswordLabel")}</Label>
                <Input id="newPassword" type="password" autoComplete="new-password" minLength={10} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t("confirmPasswordLabel")}</Label>
                <Input id="confirmPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? t("submitting") : t("submit")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </Reveal>
  );
}

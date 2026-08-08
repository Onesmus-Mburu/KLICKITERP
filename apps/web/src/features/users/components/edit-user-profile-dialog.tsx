"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import type { UpdateUserDto, UserResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { LOCALE_OPTIONS } from "../constants";
import { useUpdateUser } from "../hooks/use-users";

/**
 * `PATCH /users/:id` (`users:user:update`) — `fullName`/`email`/`phone`/
 * `locale` only, confirmed against `UpdateUserDto` directly (all 4 optional,
 * none nullable, unlike `AssignDepartmentDto.departmentId`/
 * `SetAuthorityLimitDto.amount`) — email/phone can be CHANGED here but not
 * cleared to empty via this endpoint (the DTO has no `null` variant, and an
 * empty string would fail its own `@IsEmail()`/phone-regex validation
 * anyway), so an emptied field is simply left out of the diff rather than
 * sent as `""`. Dialog, not a page — Wallet's "everything is a dialog"
 * detail-page style fits this 4-field form better than Students' dedicated-
 * edit-page style, per the plan.
 */
export function EditUserProfileDialog({ user }: { user: UserResponseDto }) {
  const t = useTranslations("users.editProfileDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [fullName, setFullName] = React.useState(user.fullName);
  const [email, setEmail] = React.useState(user.email ?? "");
  const [phone, setPhone] = React.useState(user.phone ?? "");
  const [locale, setLocale] = React.useState(user.locale);
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateUser();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setFullName(user.fullName);
      setEmail(user.email ?? "");
      setPhone(user.phone ?? "");
      setLocale(user.locale);
      setError(null);
    }
  }

  const canSubmit = fullName.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: UpdateUserDto = {};
    if (fullName.trim() !== user.fullName) dto.fullName = fullName.trim();
    if (email.trim() && email.trim() !== (user.email ?? "")) dto.email = email.trim();
    if (phone.trim() && phone.trim() !== (user.phone ?? "")) dto.phone = phone.trim();
    if (locale !== user.locale) dto.locale = locale;
    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: user.id, dto });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Pencil className="size-4" />
          {tCommon("edit")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("fullNameLabel")}</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("emailLabel")}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("phoneLabel")}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("phonePlaceholder")} />
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

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || updateMutation.isPending}>
            {updateMutation.isPending ? t("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

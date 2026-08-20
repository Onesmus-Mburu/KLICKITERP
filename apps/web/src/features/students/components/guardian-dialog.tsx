"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { GuardianResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError, parseFieldErrors } from "@/lib/api-error";
import { useCreateGuardianStandalone, useUpdateGuardian } from "../hooks/use-guardians";

/**
 * Standalone Parents page — create/edit `std_guardian` dialog, NOT tied to
 * any student (unlike `guardian-link-dialog.tsx`'s "new guardian" tab, which
 * always creates-and-links in one step). Reuses the exact same
 * `Dialog`/plain-`useState` form pattern `class-dialog.tsx` already
 * established — small enough (4 fields) that a shared field group isn't
 * worth extracting on top of the already-existing `<GuardianFields>` (which
 * bundles link-specific attributes — relationship/isPrimary/receivesBilling
 * — genuinely inapplicable here, since no student is being linked).
 *
 * **`phone` is create-only** — `UpdateGuardianDto` (confirmed by reading it
 * directly) has no `phone` field at all, so it can never be changed via
 * `PATCH /students/guardians/{id}`; the edit form shows it read-only instead
 * of omitting it entirely, so staff aren't left wondering where it went.
 */
export function GuardianDialog({
  mode,
  guardian,
  open,
  onOpenChange,
}: {
  mode: "create" | "edit";
  guardian?: GuardianResponseDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("students.guardiansPage.guardianDialog");
  const tCommon = useTranslations("common");
  const [fullName, setFullName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [nationalId, setNationalId] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  const createMutation = useCreateGuardianStandalone();
  const updateMutation = useUpdateGuardian(guardian?.id ?? "");
  const pending = createMutation.isPending || updateMutation.isPending;

  React.useEffect(() => {
    if (open) {
      setFullName(guardian?.fullName ?? "");
      setPhone(guardian?.phone ?? "");
      setEmail(guardian?.email ?? "");
      setNationalId(guardian?.nationalId ?? "");
      setFieldErrors({});
      setFormError(null);
    }
  }, [open, guardian]);

  async function handleSubmit() {
    setFormError(null);
    setFieldErrors({});
    if (!fullName.trim()) {
      setFieldErrors({ fullName: t("fullNameRequired") });
      return;
    }
    if (mode === "create" && !phone.trim() && !email.trim()) {
      setFieldErrors({ phone: t("contactRequired") });
      return;
    }
    try {
      if (mode === "create") {
        await createMutation.mutateAsync({
          fullName,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          nationalId: nationalId.trim() || undefined,
        });
      } else {
        await updateMutation.mutateAsync({
          fullName,
          email: email.trim() || undefined,
          nationalId: nationalId.trim() || undefined,
        });
      }
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        const parsed = parseFieldErrors(err);
        if (Object.keys(parsed).length > 0) {
          setFieldErrors(parsed);
          return;
        }
      }
      setFormError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("titleCreate") : t("titleEdit")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("fullName")}</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} required />
            {fieldErrors.fullName && <p className="text-xs text-destructive">{fieldErrors.fullName}</p>}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("phone")}</Label>
              {mode === "create" ? (
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
              ) : (
                <Input value={phone || "—"} disabled />
              )}
              {fieldErrors.phone && <p className="text-xs text-destructive">{fieldErrors.phone}</p>}
              {mode === "edit" && <p className="text-xs text-muted-foreground">{t("phoneImmutable")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>{t("email")}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={160} />
              {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("nationalId")}</Label>
            <Input value={nationalId} onChange={(e) => setNationalId(e.target.value)} maxLength={20} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={pending}>
            {pending ? t("submitting") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

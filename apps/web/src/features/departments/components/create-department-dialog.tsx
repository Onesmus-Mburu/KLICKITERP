"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useCreateDepartment } from "../hooks/use-departments";
import { useUsersLookup } from "../hooks/use-users-lookup";

const NAME_MAX_LENGTH = 80; // usr_department.name is varchar(80) — create-department.dto.ts.

/**
 * Phase 6 Slice 13 Part 3 — the first "create a department" UI anywhere in
 * this app (`POST /departments` has existed since the platform/users backend
 * shipped with no frontend caller until now). `headUserId` is optional here
 * (a department can exist with no head yet) — the `<Combobox>` picker mirrors
 * `ServicePointOperatorsDialog`'s user-picker shape
 * (`features/wallet/components/service-point-operators-dialog.tsx`), backed
 * by this feature's own self-contained `useUsersLookup()` rather than reaching
 * into another feature's user wrapper.
 */
export function CreateDepartmentDialog() {
  const t = useTranslations("departments.createDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [headUserId, setHeadUserId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const createMutation = useCreateDepartment();
  const usersQuery = useUsersLookup();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName("");
      setHeadUserId("");
      setError(null);
    }
  }

  const pickerItems = (usersQuery.data?.items ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})` }));
  const canSubmit = name.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        ...(headUserId ? { headUserId } : {}),
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="size-4" />
          {t("trigger")}
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
            <Label required>{t("nameLabel")}</Label>
            <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("headUserLabel")}</Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Combobox
                  items={pickerItems}
                  value={headUserId}
                  onChange={setHeadUserId}
                  placeholder={usersQuery.isLoading ? t("loadingUsers") : t("headUserPlaceholder")}
                  searchPlaceholder={t("headUserSearchPlaceholder")}
                  emptyText={t("headUserEmptyText")}
                  disabled={usersQuery.isLoading}
                />
              </div>
              {headUserId && (
                <Button type="button" variant="outline" size="icon" onClick={() => setHeadUserId("")} aria-label={t("clearHeadUser")}>
                  <X className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? t("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

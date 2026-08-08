"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DepartmentResponseDto, UpdateDepartmentDto } from "@klickit/contracts";
import { ApiError } from "@/lib/api-error";
import { useUpdateDepartment } from "../hooks/use-departments";
import { useUsersLookup } from "../hooks/use-users-lookup";

const NAME_MAX_LENGTH = 80; // usr_department.name is varchar(80) — update-department.dto.ts.

/**
 * Edit flow for an EXISTING department. Diff-based submit, same reasoning as
 * `EditRoleDialog`/`EditCustomFieldDialog`: only fields that actually changed
 * are sent.
 *
 * `headUserId` needs a three-way diff, not a two-way one, because
 * `UpdateDepartmentDto.headUserId` is genuinely `string | null` (confirmed
 * directly against `update-department.dto.ts`: `@ApiPropertyOptional({
 * description: "null clears the head" })` + `@IsOptional() @IsUUID()` applied
 * to a `string | null`-typed field) — omitting the field means "leave
 * unchanged", sending `null` means "clear the head", and sending a string
 * means "set a new head". Local state uses `""` as the Combobox's own
 * "nothing selected" sentinel (mirroring `CreateDepartmentDialog`), so the
 * diff below maps `"" -> null` only when the ORIGINAL value was non-null
 * (i.e. the admin actively cleared a previously-set head) — if the
 * department already had no head and still has none, the field is correctly
 * omitted rather than sent as a no-op `null`.
 */
export function EditDepartmentDialog({ department }: { department: DepartmentResponseDto }) {
  const t = useTranslations("departments.editDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(department.name);
  const [headUserId, setHeadUserId] = React.useState(department.headUserId ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateDepartment();
  const usersQuery = useUsersLookup();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName(department.name);
      setHeadUserId(department.headUserId ?? "");
      setError(null);
    }
  }

  const pickerItems = React.useMemo(() => {
    const items = (usersQuery.data?.items ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})` }));
    // The current head might not appear in the (capped, pageSize=200)
    // lookup page — keep their name resolvable in the trigger regardless.
    if (department.headUserId && department.headUserFullName && !items.some((i) => i.value === department.headUserId)) {
      items.push({ value: department.headUserId, label: department.headUserFullName });
    }
    return items;
  }, [usersQuery.data, department.headUserId, department.headUserFullName]);

  const canSubmit = name.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: UpdateDepartmentDto = {};
    if (name.trim() !== department.name) dto.name = name.trim();
    const originalHeadUserId = department.headUserId ?? "";
    if (headUserId !== originalHeadUserId) {
      dto.headUserId = headUserId === "" ? null : headUserId;
    }
    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: department.id, dto });
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
          <DialogTitle>{t("title", { name: department.name })}</DialogTitle>
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
            <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} />
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
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || updateMutation.isPending}>
            {updateMutation.isPending ? t("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

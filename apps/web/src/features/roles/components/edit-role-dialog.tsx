"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RoleResponseDto, UpdateRoleDto } from "@klickit/contracts";
import { ApiError } from "@/lib/api-error";
import { useUpdateRole } from "../hooks/use-roles";
import { RoleBadges } from "./role-badges";

const NAME_MAX_LENGTH = 60; // usr_role.name is varchar(60) — update-role.dto.ts.

/**
 * Edit flow for an EXISTING role. `isAuditorClass` is deliberately NOT
 * editable here — confirmed directly against `UpdateRoleDto`
 * (`packages/server/src/platform/users/api/dto/update-role.dto.ts`): it only
 * carries `name`/`description`, no `isAuditorClass` field at all (BR-SEC-04
 * classification is read-only-by-construction once a role exists, per
 * `CreateRoleDto`'s own doc comment). Shown here as a read-only badge for
 * reference, not a disabled form control pretending to be an editable
 * field — same "immutable fields shown, not faked as editable" precedent
 * `EditCustomFieldDialog` already established for `entity`/`key`/`fieldType`.
 * `isSystemTemplate` is also read-only (no DTO anywhere ever carries it —
 * it's seed-derived) and shown the same way. Diff-based submit, same
 * reasoning as `EditCustomFieldDialog`/`EditTermDialog`.
 */
export function EditRoleDialog({ role }: { role: RoleResponseDto }) {
  const t = useTranslations("roles.editDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(role.name);
  const [description, setDescription] = React.useState(role.description ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateRole();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName(role.name);
      setDescription(role.description ?? "");
      setError(null);
    }
  }

  const canSubmit = name.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: UpdateRoleDto = {};
    if (name.trim() !== role.name) dto.name = name.trim();
    if (description.trim() !== (role.description ?? "")) dto.description = description.trim();
    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: role.id, dto });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" onClick={(e) => e.stopPropagation()}>
          <Pencil className="size-4" />
          {tCommon("edit")}
        </Button>
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{t("title", { name: role.name })}</DialogTitle>
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
            <Label>{t("descriptionLabel")}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {(role.isSystemTemplate || role.isAuditorClass) && (
            <div className="space-y-1.5">
              <Label>{t("classificationLabel")}</Label>
              <RoleBadges role={role} />
              <p className="text-xs text-muted-foreground">{t("classificationHint")}</p>
            </div>
          )}
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

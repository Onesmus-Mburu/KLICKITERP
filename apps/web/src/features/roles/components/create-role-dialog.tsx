"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ApiError } from "@/lib/api-error";
import { useCreateRole } from "../hooks/use-roles";

const NAME_MAX_LENGTH = 60; // usr_role.name is varchar(60) — create-role.dto.ts.

/**
 * Phase 6 Slice 13 Part 2 — the first "create a role" UI anywhere in this
 * app (`POST /roles` has existed since the platform/users backend shipped
 * with no frontend caller until now). `isAuditorClass` is settable ONLY
 * here, never on update — confirmed directly against `CreateRoleDto` (has
 * the field, `@ApiPropertyOptional({default:false})`) vs `UpdateRoleDto`
 * (does not have it at all): BR-SEC-04 classification is read-only by
 * construction once a role exists, per `CreateRoleDto`'s own doc comment.
 */
export function CreateRoleDialog() {
  const t = useTranslations("roles.createDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [isAuditorClass, setIsAuditorClass] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const createMutation = useCreateRole();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName("");
      setDescription("");
      setIsAuditorClass(false);
      setError(null);
    }
  }

  const canSubmit = name.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        isAuditorClass,
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
            <Label>{t("descriptionLabel")}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("descriptionPlaceholder")} />
          </div>
          <label className="flex items-start gap-2 pt-1 text-sm text-foreground">
            <Checkbox checked={isAuditorClass} onChange={(e) => setIsAuditorClass(e.target.checked)} className="mt-0.5" />
            <div>
              <span>{t("isAuditorClassLabel")}</span>
              <p className="text-xs font-normal text-muted-foreground">{t("isAuditorClassHint")}</p>
            </div>
          </label>
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

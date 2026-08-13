"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import type { CostCenterResponseDto, UpdateCostCenterDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useUpdateCostCenter } from "../hooks/use-cost-centers";

const NAME_MAX_LENGTH = 80; // gl_cost_center.name is varchar(80) — update-cost-center.dto.ts.

/** `UpdateCostCenterDto` only has `name?` (`code` is locked post-creation, same "define once, deactivate + recreate to fix" precedent `accounts.api.ts`/`edit-account-dialog.tsx` document for accounts) — a plain two-way diff, no combobox/three-way-null complexity like `EditDepartmentDialog`'s `headUserId`. */
export function EditCostCenterDialog({ costCenter }: { costCenter: CostCenterResponseDto }) {
  const t = useTranslations("accounting.costCenters.editDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(costCenter.name);
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateCostCenter();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName(costCenter.name);
      setError(null);
    }
  }

  const canSubmit = name.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: UpdateCostCenterDto = {};
    if (name.trim() !== costCenter.name) dto.name = name.trim();
    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: costCenter.id, dto });
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
          <DialogTitle>{t("title", { name: costCenter.name })}</DialogTitle>
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

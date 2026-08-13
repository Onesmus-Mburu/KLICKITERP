"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useCreateCostCenter } from "../hooks/use-cost-centers";

const CODE_MAX_LENGTH = 20; // gl_cost_center.code is varchar(20) — create-cost-center.dto.ts.
const NAME_MAX_LENGTH = 80; // gl_cost_center.name is varchar(80) — create-cost-center.dto.ts.

/**
 * Phase 6 Slice 17 Part 1 (Accounting Core foundations, Module 7) — Cost
 * Centers is a flat list, no hierarchy, no picker dependency: direct
 * structural mirror of `features/departments/components/create-department-dialog.tsx`
 * (read first as this dialog's own established template), minus the
 * head-of-department `<Combobox>` (nothing analogous exists here — a cost
 * center has exactly `code`/`name`).
 */
export function CreateCostCenterDialog() {
  const t = useTranslations("accounting.costCenters.createDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const createMutation = useCreateCostCenter();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setCode("");
      setName("");
      setError(null);
    }
  }

  const canSubmit = code.trim().length > 0 && name.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await createMutation.mutateAsync({ code: code.trim(), name: name.trim() });
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
            <Label required>{t("codeLabel")}</Label>
            <Input value={code} maxLength={CODE_MAX_LENGTH} onChange={(e) => setCode(e.target.value)} placeholder={t("codePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("nameLabel")}</Label>
            <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
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

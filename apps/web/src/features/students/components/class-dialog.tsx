"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ClassResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { useCreateClass, useUpdateClass } from "../hooks/use-classes";

/**
 * Phase 6 Slice 2b item 6 — create/edit `std_class` dialog+form, reusing the
 * exact same `Dialog`/`react-hook-form`-free-controlled-input pattern
 * `guardian-link-dialog.tsx` already established (this form is small enough
 * — 2-3 fields — that plain `useState` reads more directly than pulling in
 * `react-hook-form` for it, matching that file's own "new guardian" tab
 * shape). `CreateClassDto` requires `name`+`level` only (no `isActive` — a
 * brand-new class is always active by construction, per
 * `std_class.is_active NOT NULL DEFAULT true`, confirmed in migration
 * `0065`); `UpdateClassDto` additionally allows toggling `isActive` — both
 * verified against the real DTOs before writing this, not guessed.
 */
export function ClassDialog({
  mode,
  classItem,
  open,
  onOpenChange,
}: {
  mode: "create" | "edit";
  classItem?: ClassResponseDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("students.classesPage.classDialog");
  const tCommon = useTranslations("common");
  const [name, setName] = React.useState("");
  const [level, setLevel] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateClass();
  const updateMutation = useUpdateClass(classItem?.id ?? "");
  const pending = createMutation.isPending || updateMutation.isPending;

  React.useEffect(() => {
    if (open) {
      setName(classItem?.name ?? "");
      setLevel(classItem ? String(classItem.level) : "");
      setIsActive(classItem?.isActive ?? true);
      setError(null);
    }
  }, [open, classItem]);

  async function handleSubmit() {
    setError(null);
    const parsedLevel = Number(level);
    if (!name.trim()) {
      setError(t("nameRequired"));
      return;
    }
    if (!Number.isFinite(parsedLevel) || parsedLevel < 0) {
      setError(t("levelInvalid"));
      return;
    }
    try {
      if (mode === "create") {
        await createMutation.mutateAsync({ name, level: parsedLevel });
      } else {
        await updateMutation.mutateAsync({ name, level: parsedLevel, isActive });
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("titleCreate") : t("titleEdit")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("level")}</Label>
            <Input type="number" min={0} value={level} onChange={(e) => setLevel(e.target.value)} required />
          </div>
          {mode === "edit" && (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="size-4 rounded border-input" />
              {t("isActive")}
            </label>
          )}
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

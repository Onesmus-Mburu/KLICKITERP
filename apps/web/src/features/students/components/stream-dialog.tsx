"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { StreamResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { useCreateStream, useUpdateStream } from "../hooks/use-streams";

/** Phase 6 Slice 2b item 6 — create/edit `std_stream` dialog, scoped to `classId` (a stream always belongs to exactly one class — `CreateStreamDto.classId` is required, confirmed against the real DTO). Same small-form-plain-`useState` shape as `class-dialog.tsx`. */
export function StreamDialog({
  classId,
  mode,
  streamItem,
  open,
  onOpenChange,
}: {
  classId: string;
  mode: "create" | "edit";
  streamItem?: StreamResponseDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("students.classesPage.streamDialog");
  const tCommon = useTranslations("common");
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateStream(classId);
  const updateMutation = useUpdateStream(classId, streamItem?.id ?? "");
  const pending = createMutation.isPending || updateMutation.isPending;

  React.useEffect(() => {
    if (open) {
      setName(streamItem?.name ?? "");
      setError(null);
    }
  }, [open, streamItem]);

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError(t("nameRequired"));
      return;
    }
    try {
      if (mode === "create") {
        await createMutation.mutateAsync({ classId, name });
      } else {
        await updateMutation.mutateAsync({ name });
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

        <div className="space-y-1.5">
          <Label required>{t("name")}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
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

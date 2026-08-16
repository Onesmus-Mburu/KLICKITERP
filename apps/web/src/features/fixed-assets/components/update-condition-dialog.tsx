"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ClipboardCheck } from "lucide-react";
import type { FaAssetResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useUpdateAssetCondition } from "../hooks/use-assets";

const CONDITION_MAX_LENGTH = 20; // fa_asset.condition is varchar(20) — fa-asset.entity.ts.

/**
 * Phase 6 Slice 23 Part 1 (Fixed Assets foundations, Module 17) — a
 * dedicated single-field dialog for `PATCH .../{id}/condition`
 * (`UpdateFaAssetConditionDto`), deliberately SEPARATE from the general
 * `<EditAssetDialog>` — the controller's own doc comment calls this out as
 * "the verification/inspection entry point," a genuinely distinct action
 * from a general register edit, confirmed by reading `AssetsController`
 * directly (its own `@Patch(":id/condition")` route, separate from
 * `@Patch(":id")`).
 *
 * `condition` is an un-enumerated `varchar(20)` — no fixed value list exists
 * anywhere server-side (confirmed by reading `fa-asset.entity.ts` directly:
 * no `@Check` constraint, unlike `status`/`fundingSource`) — this dialog is
 * a plain text input, not a `<Select>`, matching that real lack of an enum.
 */
export function UpdateConditionDialog({ asset }: { asset: FaAssetResponseDto }) {
  const t = useTranslations("fixedAssets.assets.updateConditionDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [condition, setCondition] = React.useState(asset.condition);
  const [error, setError] = React.useState<string | null>(null);

  const updateConditionMutation = useUpdateAssetCondition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setCondition(asset.condition);
      setError(null);
    }
  }

  const canSubmit = condition.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await updateConditionMutation.mutateAsync({ id: asset.id, dto: { condition: condition.trim() } });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <ClipboardCheck className="size-4" />
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

        <div className="space-y-1.5">
          <Label required>{t("conditionLabel")}</Label>
          <Input
            value={condition}
            maxLength={CONDITION_MAX_LENGTH}
            onChange={(e) => setCondition(e.target.value)}
            placeholder={t("conditionPlaceholder")}
          />
          <p className="text-xs text-muted-foreground">{t("conditionHint")}</p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || updateConditionMutation.isPending}>
            {updateConditionMutation.isPending ? t("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

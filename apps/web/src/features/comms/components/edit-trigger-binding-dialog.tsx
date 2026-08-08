"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import type { TriggerBindingResponseDto, UpdateTriggerBindingDto } from "@klickit/contracts";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-error";
import { useUpdateTriggerBinding } from "../hooks/use-trigger-bindings";
import { ChannelBadge } from "./channel-badge";

function audienceRuleToText(audienceRule: unknown): string {
  if (audienceRule === null || audienceRule === undefined) return "";
  try {
    return JSON.stringify(audienceRule, null, 2);
  } catch {
    return "";
  }
}

/**
 * Edit flow for an EXISTING trigger binding. `eventCode`/`channel` are
 * deliberately NOT editable here — confirmed directly against
 * `UpdateTriggerBindingDto` (`packages/server/.../dto/update-trigger-
 * binding.dto.ts`): it only carries `isEnabled`/`audienceRule`, neither of
 * the unique-pair fields at all. They form `comm_trigger_binding`'s own
 * unique pair, read-only-by-construction once a row exists (see
 * `create-trigger-binding-dialog.tsx`'s own doc comment). Shown here as
 * read-only reference (a `<ChannelBadge>` + plain event-code text), not
 * disabled form controls pretending to be editable — the same "immutable
 * fields shown, not faked as editable" precedent `EditTemplateDialog`
 * established for `eventCode`/`channel`/`locale`. Diff-based submit, same
 * reasoning as `EditTemplateDialog`.
 */
export function EditTriggerBindingDialog({ binding }: { binding: TriggerBindingResponseDto }) {
  const t = useTranslations("communications.triggerBindings.editDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [isEnabled, setIsEnabled] = React.useState(binding.isEnabled);
  const [audienceRuleText, setAudienceRuleText] = React.useState(audienceRuleToText(binding.audienceRule));
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateTriggerBinding();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setIsEnabled(binding.isEnabled);
      setAudienceRuleText(audienceRuleToText(binding.audienceRule));
      setError(null);
    }
  }

  async function handleSubmit() {
    setError(null);

    const originalAudienceRuleText = audienceRuleToText(binding.audienceRule);
    const audienceRuleChanged = audienceRuleText.trim() !== originalAudienceRuleText.trim();
    let nextAudienceRule: Record<string, unknown> | undefined;
    if (audienceRuleChanged) {
      if (audienceRuleText.trim()) {
        try {
          nextAudienceRule = JSON.parse(audienceRuleText) as Record<string, unknown>;
        } catch {
          setError(t("invalidAudienceRuleJson"));
          return;
        }
      } else {
        nextAudienceRule = {};
      }
    }

    const dto: UpdateTriggerBindingDto = {};
    if (isEnabled !== binding.isEnabled) dto.isEnabled = isEnabled;
    if (audienceRuleChanged) dto.audienceRule = nextAudienceRule;

    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }

    try {
      await updateMutation.mutateAsync({ id: binding.id, dto });
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
          <DialogTitle>{t("title", { eventCode: binding.eventCode })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("identityLabel")}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <ChannelBadge channel={binding.channel} />
              <span className="text-sm text-muted-foreground">{binding.eventCode}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t("identityHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("audienceRuleLabel")}</Label>
            <Textarea value={audienceRuleText} rows={3} onChange={(e) => setAudienceRuleText(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("audienceRuleHint")}</p>
          </div>
          <label className="flex items-start gap-2 pt-1 text-sm text-foreground">
            <Checkbox checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} className="mt-0.5" />
            <span>{t("isEnabledLabel")}</span>
          </label>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? t("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

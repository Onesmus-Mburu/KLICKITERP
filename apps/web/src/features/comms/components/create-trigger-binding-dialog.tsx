"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreateTriggerBindingDto } from "@klickit/contracts";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-error";
import { useCreateTriggerBinding } from "../hooks/use-trigger-bindings";

const EVENT_CODE_MAX_LENGTH = 50; // comm_trigger_binding.event_code is varchar(50) — create-trigger-binding.dto.ts.

// Same literal order as `COMM_CHANNELS` (comm-template.entity.ts) — matches
// `create-template-dialog.tsx`'s/`create-broadcast-dialog.tsx`'s/
// `create-optout-dialog.tsx`'s own CHANNELS lists.
const CHANNELS: CreateTriggerBindingDto["channel"][] = ["SMS", "EMAIL", "PUSH", "WHATSAPP", "INAPP"];

/**
 * Phase 6 Slice 15 Part 3 — the first "create a trigger binding" UI anywhere
 * in this app (`POST /comms/trigger-bindings` had no frontend caller before
 * this part). `eventCode`/`channel` are settable ONLY here, never on update
 * — confirmed directly against `CreateTriggerBindingDto` (has both) vs
 * `UpdateTriggerBindingDto` (has neither): together they form
 * `comm_trigger_binding`'s own unique pair, immutable by construction once a
 * row exists — the exact same "some fields are create-only" shape
 * `CreateTemplateDto`'s own `eventCode`/`channel`/`locale` already
 * established for Templates (see `create-template-dialog.tsx`'s own doc
 * comment).
 *
 * `audienceRule` (an untyped `Record<string, unknown>` — no dispatcher reads
 * these rows automatically yet, per `TriggerBindingsController`'s own doc
 * comment, so there's no real schema to validate it against) is edited here
 * as a raw, optional JSON textarea, the same "no single realistic shape to
 * special-case" reasoning `create-template-dialog.tsx` already gives its own
 * `variables` field.
 */
export function CreateTriggerBindingDialog() {
  const t = useTranslations("communications.triggerBindings.createDialog");
  const tChannels = useTranslations("communications.channels");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [eventCode, setEventCode] = React.useState("");
  const [channel, setChannel] = React.useState<CreateTriggerBindingDto["channel"]>("EMAIL");
  const [isEnabled, setIsEnabled] = React.useState(true);
  const [audienceRuleText, setAudienceRuleText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const createMutation = useCreateTriggerBinding();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setEventCode("");
      setChannel("EMAIL");
      setIsEnabled(true);
      setAudienceRuleText("");
      setError(null);
    }
  }

  const canSubmit = eventCode.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);

    let audienceRule: Record<string, unknown> | undefined;
    if (audienceRuleText.trim()) {
      try {
        audienceRule = JSON.parse(audienceRuleText) as Record<string, unknown>;
      } catch {
        setError(t("invalidAudienceRuleJson"));
        return;
      }
    }

    try {
      const dto: CreateTriggerBindingDto = {
        eventCode: eventCode.trim(),
        channel,
        isEnabled,
        ...(audienceRule ? { audienceRule } : {}),
      };
      await createMutation.mutateAsync(dto);
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label required>{t("eventCodeLabel")}</Label>
              <Input
                value={eventCode}
                maxLength={EVENT_CODE_MAX_LENGTH}
                onChange={(e) => setEventCode(e.target.value)}
                placeholder={t("eventCodePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("channelLabel")}</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as CreateTriggerBindingDto["channel"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {tChannels(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("audienceRuleLabel")}</Label>
            <Textarea value={audienceRuleText} rows={3} onChange={(e) => setAudienceRuleText(e.target.value)} placeholder={t("audienceRulePlaceholder")} />
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
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? t("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

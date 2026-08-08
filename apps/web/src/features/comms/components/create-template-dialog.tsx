"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreateTemplateDto } from "@klickit/contracts";
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
import { useCreateTemplate } from "../hooks/use-templates";

const EVENT_CODE_MAX_LENGTH = 50; // comm_template.event_code is varchar(50) — create-template.dto.ts.
const LOCALE_MAX_LENGTH = 8; // comm_template.locale is varchar(8) — create-template.dto.ts.
const SUBJECT_MAX_LENGTH = 200; // comm_template.subject is varchar(200) — create-template.dto.ts.

// Same literal order as `COMM_CHANNELS` (comm-template.entity.ts) — not
// reordered "real adapters first," so as not to invent an ordering
// convention the backend's own enum doesn't have.
const CHANNELS: CreateTemplateDto["channel"][] = ["SMS", "EMAIL", "PUSH", "WHATSAPP", "INAPP"];

/**
 * Phase 6 Slice 15 Part 1 — the first "create a template" UI anywhere in
 * this app (`POST /comms/templates` has existed since the platform/comms
 * backend shipped with no frontend caller until now). `eventCode`/
 * `channel`/`locale` are settable ONLY here, never on update — confirmed
 * directly against `CreateTemplateDto` (has all 3) vs `UpdateTemplateDto`
 * (has none of them): together they form `comm_template`'s own unique
 * triple (`uq_comm_template_event_channel_locale`), immutable by
 * construction once a row exists — the exact same "some fields are
 * create-only" shape `CreateRoleDto.isAuditorClass`/`UpdateRoleDto` already
 * established for Roles (see `create-role-dialog.tsx`'s own doc comment).
 *
 * `variables` (docs-only `Record<string, unknown>` — `TemplatesService
 * .render()` never validates it, per `comm-template.entity.ts`'s own doc
 * comment) is edited here as a raw, optional JSON textarea rather than a
 * structured builder: unlike `set_custom_field_def.options` (which this
 * app's own `custom-field-options.ts` commits to a flat string-array
 * shape for its one realistic SELECT-choices case), `variables` has no
 * single realistic shape to special-case — it is genuinely arbitrary
 * documentation of whatever placeholder names a template's body/subject
 * use, so a plain JSON textarea (parsed client-side, rejected before
 * submit if invalid) is the honest, simplest real form for it.
 */
export function CreateTemplateDialog() {
  const t = useTranslations("communications.createDialog");
  const tChannels = useTranslations("communications.channels");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [eventCode, setEventCode] = React.useState("");
  const [channel, setChannel] = React.useState<CreateTemplateDto["channel"]>("EMAIL");
  const [locale, setLocale] = React.useState("en");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [variablesText, setVariablesText] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const createMutation = useCreateTemplate();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setEventCode("");
      setChannel("EMAIL");
      setLocale("en");
      setSubject("");
      setBody("");
      setVariablesText("");
      setIsActive(true);
      setError(null);
    }
  }

  const canSubmit = eventCode.trim().length > 0 && body.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);

    let variables: Record<string, unknown> | undefined;
    if (variablesText.trim()) {
      try {
        variables = JSON.parse(variablesText) as Record<string, unknown>;
      } catch {
        setError(t("invalidVariablesJson"));
        return;
      }
    }

    try {
      const dto: CreateTemplateDto = {
        eventCode: eventCode.trim(),
        channel,
        body: body.trim(),
        isActive,
        ...(locale.trim() ? { locale: locale.trim() } : {}),
        ...(subject.trim() ? { subject: subject.trim() } : {}),
        ...(variables ? { variables } : {}),
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
              <Select value={channel} onValueChange={(v) => setChannel(v as CreateTemplateDto["channel"])}>
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
            <Label>{t("localeLabel")}</Label>
            <Input value={locale} maxLength={LOCALE_MAX_LENGTH} onChange={(e) => setLocale(e.target.value)} placeholder={t("localePlaceholder")} />
            <p className="text-xs text-muted-foreground">{t("localeHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("subjectLabel")}</Label>
            <Input value={subject} maxLength={SUBJECT_MAX_LENGTH} onChange={(e) => setSubject(e.target.value)} placeholder={t("subjectPlaceholder")} />
            <p className="text-xs text-muted-foreground">{t("subjectHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("bodyLabel")}</Label>
            <Textarea value={body} rows={5} onChange={(e) => setBody(e.target.value)} placeholder={t("bodyPlaceholder")} />
            <p className="text-xs text-muted-foreground">{t("bodyHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("variablesLabel")}</Label>
            <Textarea value={variablesText} rows={3} onChange={(e) => setVariablesText(e.target.value)} placeholder={t("variablesPlaceholder")} />
            <p className="text-xs text-muted-foreground">{t("variablesHint")}</p>
          </div>
          <label className="flex items-start gap-2 pt-1 text-sm text-foreground">
            <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="mt-0.5" />
            <span>{t("isActiveLabel")}</span>
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

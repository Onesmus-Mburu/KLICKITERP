"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import type { TemplateResponseDto, UpdateTemplateDto } from "@klickit/contracts";
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
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-error";
import { useUpdateTemplate } from "../hooks/use-templates";
import { ChannelBadge } from "./channel-badge";

const SUBJECT_MAX_LENGTH = 200; // comm_template.subject is varchar(200) — update-template.dto.ts.

function variablesToText(variables: unknown): string {
  if (variables === null || variables === undefined) return "";
  try {
    return JSON.stringify(variables, null, 2);
  } catch {
    return "";
  }
}

/**
 * Edit flow for an EXISTING template. `eventCode`/`channel`/`locale` are
 * deliberately NOT editable here — confirmed directly against
 * `UpdateTemplateDto` (`packages/server/.../dto/update-template.dto.ts`):
 * it only carries `subject`/`body`/`variables`/`isActive`, none of the
 * unique-triple fields at all. They form `comm_template`'s own unique
 * triple, read-only-by-construction once a row exists (see
 * `create-template-dialog.tsx`'s own doc comment). Shown here as read-only
 * reference (a `<ChannelBadge>` + plain locale text), not disabled form
 * controls pretending to be editable — the same "immutable fields shown,
 * not faked as editable" precedent `EditRoleDialog` established for
 * `isAuditorClass`. Diff-based submit, same reasoning as `EditRoleDialog`/
 * `EditDepartmentDialog`.
 */
export function EditTemplateDialog({ template }: { template: TemplateResponseDto }) {
  const t = useTranslations("communications.editDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [subject, setSubject] = React.useState(template.subject ?? "");
  const [body, setBody] = React.useState(template.body);
  const [variablesText, setVariablesText] = React.useState(variablesToText(template.variables));
  const [isActive, setIsActive] = React.useState(template.isActive);
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateTemplate();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setSubject(template.subject ?? "");
      setBody(template.body);
      setVariablesText(variablesToText(template.variables));
      setIsActive(template.isActive);
      setError(null);
    }
  }

  const canSubmit = body.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);

    const originalVariablesText = variablesToText(template.variables);
    const variablesChanged = variablesText.trim() !== originalVariablesText.trim();
    let nextVariables: Record<string, unknown> | undefined;
    if (variablesChanged) {
      if (variablesText.trim()) {
        try {
          nextVariables = JSON.parse(variablesText) as Record<string, unknown>;
        } catch {
          setError(t("invalidVariablesJson"));
          return;
        }
      } else {
        nextVariables = {};
      }
    }

    const dto: UpdateTemplateDto = {};
    if (subject.trim() !== (template.subject ?? "")) dto.subject = subject.trim();
    if (body.trim() !== template.body) dto.body = body.trim();
    if (variablesChanged) dto.variables = nextVariables;
    if (isActive !== template.isActive) dto.isActive = isActive;

    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }

    try {
      await updateMutation.mutateAsync({ id: template.id, dto });
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
          <DialogTitle>{t("title", { eventCode: template.eventCode })}</DialogTitle>
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
              <ChannelBadge channel={template.channel} />
              <span className="text-sm text-muted-foreground">{template.locale}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t("identityHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("subjectLabel")}</Label>
            <Input value={subject} maxLength={SUBJECT_MAX_LENGTH} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("bodyLabel")}</Label>
            <Textarea value={body} rows={5} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("variablesLabel")}</Label>
            <Textarea value={variablesText} rows={3} onChange={(e) => setVariablesText(e.target.value)} />
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
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || updateMutation.isPending}>
            {updateMutation.isPending ? t("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

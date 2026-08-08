"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { AudienceDefDto, CreateBroadcastDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { MoneyInput } from "@/components/patterns/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-error";
import { useCreateBroadcast } from "../hooks/use-broadcasts";
import { AudiencePicker, EMPTY_AUDIENCE_PICKER_VALUE, type AudiencePickerValue } from "./audience-picker";

const TITLE_MAX_LENGTH = 120; // comm_broadcast.title is varchar(120) — create-broadcast.dto.ts.

// Same literal order as `COMM_CHANNELS` (comm-template.entity.ts) — matches
// `create-template-dialog.tsx`'s own CHANNELS list; broadcasts reuse the
// identical `CommChannel` enum, not a broadcast-specific subset.
const CHANNELS: CreateBroadcastDto["channel"][] = ["SMS", "EMAIL", "PUSH", "WHATSAPP", "INAPP"];

/**
 * Phase 6 Slice 15 Part 2 — the first "create a broadcast" UI anywhere in
 * this app (`POST /comms/broadcasts` had no frontend caller before this
 * part). A dialog, not a dedicated `/new` page — this form has a similar
 * field count to `CreateTemplateDialog`'s own 7-field precedent (title,
 * channel, body, audience kind + one of role/users, optional cost), which
 * that dialog already established fits fine as a dialog.
 *
 * On success, navigates straight to the new broadcast's own detail page
 * (`/communications/broadcasts/{id}`) — the real submit/approve/cancel/send
 * actions live there, not on this list page (unlike Templates, whose whole
 * lifecycle is edit/delete, so it never needed its own detail route). Same
 * "close dialog, jump to the new resource's detail page" precedent
 * `fee-structure-create-dialog.tsx`/`receipt-capture-form.tsx` already
 * establish for a just-created resource with real follow-on actions.
 */
export function CreateBroadcastDialog() {
  const t = useTranslations("communications.broadcasts.createDialog");
  const tChannels = useTranslations("communications.channels");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [channel, setChannel] = React.useState<CreateBroadcastDto["channel"]>("EMAIL");
  const [body, setBody] = React.useState("");
  const [audience, setAudience] = React.useState<AudiencePickerValue>(EMPTY_AUDIENCE_PICKER_VALUE);
  const [estCostAmount, setEstCostAmount] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const createMutation = useCreateBroadcast();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setTitle("");
      setChannel("EMAIL");
      setBody("");
      setAudience(EMPTY_AUDIENCE_PICKER_VALUE);
      setEstCostAmount(null);
      setError(null);
    }
  }

  const audienceValid = audience.kind === "STAFF_ROLE" ? audience.roleId.length > 0 : audience.userIds.length > 0;
  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && audienceValid;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);

    const audienceDef: AudienceDefDto =
      audience.kind === "STAFF_ROLE" ? { kind: "STAFF_ROLE", roleId: audience.roleId } : { kind: "EXPLICIT_USER_IDS", userIds: audience.userIds };

    try {
      const dto: CreateBroadcastDto = {
        title: title.trim(),
        audienceDef,
        channel,
        body: body.trim(),
        ...(estCostAmount ? { estCostAmount } : {}),
      };
      const created = await createMutation.mutateAsync(dto);
      setOpen(false);
      router.push(`/communications/broadcasts/${created.id}`);
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
              <Label required>{t("titleLabel")}</Label>
              <Input value={title} maxLength={TITLE_MAX_LENGTH} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("channelLabel")}</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as CreateBroadcastDto["channel"])}>
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
            <Label required>{t("bodyLabel")}</Label>
            <Textarea value={body} rows={5} onChange={(e) => setBody(e.target.value)} placeholder={t("bodyPlaceholder")} />
          </div>

          <AudiencePicker value={audience} onChange={setAudience} />

          <div className="space-y-1.5">
            <Label>{t("estCostLabel")}</Label>
            <MoneyInput value={estCostAmount ?? ""} onValueChange={setEstCostAmount} />
            <p className="text-xs text-muted-foreground">{t("estCostHint")}</p>
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

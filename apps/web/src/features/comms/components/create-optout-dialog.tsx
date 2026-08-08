"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreateOptoutDto } from "@klickit/contracts";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { useCreateOptout } from "../hooks/use-optouts";

const SCOPE_MAX_LENGTH = 30; // comm_optout.scope is varchar(30) — create-optout.dto.ts.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Same literal order as `COMM_CHANNELS` (comm-template.entity.ts) — matches
// `create-template-dialog.tsx`'s/`create-broadcast-dialog.tsx`'s own
// CHANNELS lists.
const CHANNELS: CreateOptoutDto["channel"][] = ["SMS", "EMAIL", "PUSH", "WHATSAPP", "INAPP"];

/**
 * Phase 6 Slice 15 Part 3 — the first "create an opt-out" UI anywhere in
 * this app (`POST /comms/optouts` had no frontend caller before this part).
 * `guardianId` is a plain, free-typed `<Input>` — not a search/combobox
 * picker — because there is genuinely no guardian/student directory
 * anywhere in this codebase yet (Students module, #8, isn't built) and
 * `guardianId` has no FK (confirmed directly against `CreateOptoutDto`'s own
 * `@ApiProperty` description, see `optouts.api.ts`'s own doc comment) — the
 * honest real shape here, not a gap to paper over, per this part's own plan.
 * A lightweight client-side UUID-shape check runs before submit (the same
 * courtesy `optouts/page.tsx`'s own search box gives its lookup key) — the
 * backend's real `@IsUUID()` validation is still the authoritative check,
 * this is just a faster, friendlier failure than a round-trip 400.
 *
 * `defaultGuardianId` (optional) pre-fills the field from whatever guardian
 * the page currently has searched, if any — reads more naturally than
 * always starting blank when the page already has a guardian in view (the
 * plan's own "your call" resolved this way); the field stays fully editable
 * either way, since a real admin may want to opt out a DIFFERENT guardian
 * than the one currently searched.
 */
export function CreateOptoutDialog({ defaultGuardianId }: { defaultGuardianId?: string }) {
  const t = useTranslations("communications.optouts.createDialog");
  const tChannels = useTranslations("communications.channels");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [guardianId, setGuardianId] = React.useState(defaultGuardianId ?? "");
  const [channel, setChannel] = React.useState<CreateOptoutDto["channel"]>("SMS");
  const [scope, setScope] = React.useState("ALL");
  const [error, setError] = React.useState<string | null>(null);
  const createMutation = useCreateOptout();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setGuardianId(defaultGuardianId ?? "");
      setChannel("SMS");
      setScope("ALL");
      setError(null);
    }
  }

  const trimmedGuardianId = guardianId.trim();
  const canSubmit = UUID_PATTERN.test(trimmedGuardianId) && scope.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) {
      setError(t("invalidGuardianId"));
      return;
    }
    setError(null);

    try {
      const dto: CreateOptoutDto = { guardianId: trimmedGuardianId, channel, scope: scope.trim() };
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
          <div className="space-y-1.5">
            <Label required>{t("guardianIdLabel")}</Label>
            <Input value={guardianId} onChange={(e) => setGuardianId(e.target.value)} placeholder={t("guardianIdPlaceholder")} />
            <p className="text-xs text-muted-foreground">{t("guardianIdHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("channelLabel")}</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as CreateOptoutDto["channel"])}>
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
          <div className="space-y-1.5">
            <Label required>{t("scopeLabel")}</Label>
            <Input value={scope} maxLength={SCOPE_MAX_LENGTH} onChange={(e) => setScope(e.target.value)} placeholder={t("scopePlaceholder")} />
            <p className="text-xs text-muted-foreground">{t("scopeHint")}</p>
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

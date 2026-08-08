"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { RegisterDeviceTokenDto } from "@klickit/contracts";
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
import { useRegisterDeviceToken } from "../hooks/use-device-tokens";

const TOKEN_MAX_LENGTH = 300; // comm_device_token.token is varchar(300) — register-device-token.dto.ts.

// Same literal order as `PLATFORMS` (register-device-token.dto.ts) — matches
// `create-optout-dialog.tsx`'s own CHANNELS-list-mirrors-the-DTO-enum-order convention.
const PLATFORMS: RegisterDeviceTokenDto["platform"][] = ["IOS", "ANDROID", "WEB"];

/**
 * Phase 6 Slice 15 Part 4 — the first "register a device" UI anywhere in
 * this app (`POST /comms/device-tokens` had no frontend caller before this
 * part). A real, honest constraint this dialog is built around, not worked
 * around: there is no mobile/PWA client anywhere in this codebase that
 * actually produces real push tokens today (no push-notification-capable
 * frontend exists yet), so the token field is a plain free-typed `<Input>`
 * — not something auto-populated from a real device API, the same
 * honest-plain-input reasoning `create-optout-dialog.tsx`'s own
 * `guardianId` field gives for a different missing-directory reason. The
 * endpoint and this form are both genuinely functional regardless: a real
 * row lands in `comm_device_token` on submit, round-trippable through
 * `UnregisterDeviceTokenButton`.
 */
export function RegisterDeviceTokenDialog() {
  const t = useTranslations("myDevices.registerDialog");
  const tPlatforms = useTranslations("myDevices.platforms");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [token, setToken] = React.useState("");
  const [platform, setPlatform] = React.useState<RegisterDeviceTokenDto["platform"]>("WEB");
  const [error, setError] = React.useState<string | null>(null);
  const mutation = useRegisterDeviceToken();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setToken("");
      setPlatform("WEB");
      setError(null);
    }
  }

  const trimmedToken = token.trim();
  const canSubmit = trimmedToken.length > 0 && trimmedToken.length <= TOKEN_MAX_LENGTH;

  async function handleSubmit() {
    if (!canSubmit) {
      setError(t("invalidToken"));
      return;
    }
    setError(null);

    try {
      const dto: RegisterDeviceTokenDto = { token: trimmedToken, platform };
      await mutation.mutateAsync(dto);
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
            <Label required>{t("tokenLabel")}</Label>
            <Input value={token} maxLength={TOKEN_MAX_LENGTH} onChange={(e) => setToken(e.target.value)} placeholder={t("tokenPlaceholder")} />
            <p className="text-xs text-muted-foreground">{t("tokenHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("platformLabel")}</Label>
            <Select value={platform} onValueChange={(v) => setPlatform(v as RegisterDeviceTokenDto["platform"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {tPlatforms(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending ? t("registering") : t("registerButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import type { DeviceTokenResponseDto } from "@klickit/contracts";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { useUnregisterDeviceToken } from "../hooks/use-device-tokens";
import { maskDeviceToken } from "../api/device-tokens.api";

/**
 * Real unregister ("remove") action for a `comm_device_token` row (Phase 6
 * Slice 15 Part 4) — same trigger+confirm-dialog+error-banner shape
 * `DeleteTemplateButton`/`DeleteOptoutButton` already establish, reused
 * directly (no separate `AlertDialog` primitive exists anywhere in this
 * codebase). Genuinely non-reversible from this screen's own point of view
 * — the device itself would need to re-register to appear here again — so
 * it gets the same confirm-before-destroy treatment as every other real
 * delete in this app.
 *
 * `DELETE /comms/device-tokens` is keyed by the token VALUE, not an id in
 * the URL (confirmed by reading `DeviceTokensController` directly) — the
 * confirm dialog shows a masked preview of that same value (`maskDeviceToken`,
 * the same helper the list page uses for its own token column), so what's
 * displayed matches what's actually sent in the mutation.
 */
export function UnregisterDeviceTokenButton({ device }: { device: DeviceTokenResponseDto }) {
  const t = useTranslations("myDevices.unregisterDialog");
  const tPlatforms = useTranslations("myDevices.platforms");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const mutation = useUnregisterDeviceToken();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  async function handleConfirm() {
    setError(null);
    try {
      await mutation.mutateAsync({ token: device.token });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive hover:bg-tint-destructive hover:text-destructive"
          onClick={(e) => e.stopPropagation()}
        >
          <Trash2 className="size-4" />
          {tCommon("delete")}
        </Button>
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description", { platform: tPlatforms(device.platform), token: maskDeviceToken(device.token) })}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={mutation.isPending}>
            {mutation.isPending ? t("unregistering") : tCommon("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

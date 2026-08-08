"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import type { OptoutResponseDto } from "@klickit/contracts";
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
import { useDeleteOptout } from "../hooks/use-optouts";

/**
 * Real delete ("undo") action for a `comm_optout` row (Phase 6 Slice 15
 * Part 3) — same trigger+confirm-dialog+error-banner shape
 * `DeleteTemplateButton` already establishes (Part 1), reused directly, not
 * a new pattern (no separate `AlertDialog` primitive exists anywhere in this
 * codebase — confirmed by listing `components/ui/` before building Part 1's
 * own copy of this shape). The confirm dialog names the specific opt-out
 * (channel + scope) before anything is sent.
 */
export function DeleteOptoutButton({ optout }: { optout: OptoutResponseDto }) {
  const t = useTranslations("communications.optouts.deleteDialog");
  const tChannels = useTranslations("communications.channels");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const mutation = useDeleteOptout();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  async function handleConfirm() {
    setError(null);
    try {
      await mutation.mutateAsync({ id: optout.id, guardianId: optout.guardianId });
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
          <DialogDescription>{t("description", { channel: tChannels(optout.channel), scope: optout.scope })}</DialogDescription>
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
            {mutation.isPending ? t("deleting") : tCommon("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

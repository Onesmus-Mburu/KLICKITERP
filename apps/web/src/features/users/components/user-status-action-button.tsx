"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { UseMutationResult } from "@tanstack/react-query";
import type { UserResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { ALLOWED_STATUS_TRANSITIONS, TARGET_STATUS_TO_VERB, type UserStatus } from "../constants";
import { useDeactivateUser, useReactivateUser, useSuspendUser } from "../hooks/use-users";

type TargetStatus = Exclude<UserStatus, "INVITED">;

function TransitionConfirmButton({
  userId,
  targetStatus,
  destructive,
  mutation,
}: {
  userId: string;
  targetStatus: TargetStatus;
  destructive: boolean;
  mutation: UseMutationResult<UserResponseDto, unknown, string>;
}) {
  const t = useTranslations("users.statusActions");
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  async function handleConfirm() {
    setError(null);
    try {
      await mutation.mutateAsync(userId);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant={destructive ? "destructive" : "outline"} size="sm">
          {t(`${targetStatus}.trigger`)}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`${targetStatus}.title`)}</DialogTitle>
          <DialogDescription>{t(`${targetStatus}.description`)}</DialogDescription>
        </DialogHeader>

        {/* DEACTIVATED is the real terminal state — `ALLOWED_TRANSITIONS.DEACTIVATED === []` server-side, zero legal transitions out. An explicit, unmissable "permanent, cannot be undone" warning, not just destructive button styling. */}
        {destructive && (
          <Alert variant="destructive">
            <AlertDescription>{t("deactivatePermanentWarning")}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={() => void handleConfirm()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t("submitting") : t(`${targetStatus}.confirmButton`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Renders one confirm-dialog-gated button per CURRENTLY-legal transition
 * (`ALLOWED_STATUS_TRANSITIONS[user.status]`) — not a `<Select>`, since these
 * are 3 separate no-body verb endpoints (`PATCH .../suspend`/`:reactivate`/
 * `:deactivate`) with no single PATCH body to build from a selection, per
 * the plan's own explicit reasoning. All 3 mutation hooks are called
 * unconditionally at the top (Rules-of-Hooks safe — a fixed set, always
 * called, only the RENDER decision is conditional), mirroring
 * `PermissionGrantCell`'s own per-row-independent-mutation-hooks precedent.
 */
export function UserStatusActions({ user }: { user: UserResponseDto }) {
  const suspendMutation = useSuspendUser();
  const reactivateMutation = useReactivateUser();
  const deactivateMutation = useDeactivateUser();

  const allowed = ALLOWED_STATUS_TRANSITIONS[user.status as UserStatus] ?? [];

  return (
    <>
      {allowed.map((targetStatus) => {
        const target = targetStatus as TargetStatus;
        const verb = TARGET_STATUS_TO_VERB[target];
        const mutation = verb === "suspend" ? suspendMutation : verb === "reactivate" ? reactivateMutation : deactivateMutation;
        return (
          <TransitionConfirmButton
            key={target}
            userId={user.id}
            targetStatus={target}
            destructive={target === "DEACTIVATED"}
            mutation={mutation}
          />
        );
      })}
    </>
  );
}

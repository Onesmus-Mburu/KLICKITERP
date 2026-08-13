"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import type { AccountResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useDeleteAccount } from "../hooks/use-accounts";

/**
 * Phase 6 Slice 17 Part 1 (Accounting Core foundations, Module 7) — a small,
 * standalone component NOT explicitly named in the plan's own component
 * list, added because the plan's own verification section explicitly
 * requires a real, catchable 409-has-postings error path with "actionable
 * message... not a generic error toast" — a big enough, distinct enough
 * concern to pull out of `account-tree.tsx` rather than inline it there,
 * matching `features/comms/components/delete-optout-button.tsx`'s own
 * trigger+confirm-dialog+error-banner shape (read first as this component's
 * own template).
 *
 * **The 409 branch specifically**: `AccountsController.remove()` rejects
 * with a real `409` when the account has any journal-line postings
 * (`ChartOfAccountsService.remove()`) — `ApiError.status === 409` is
 * checked explicitly and rendered as `hasPostingsError` (a fixed,
 * actionable "deactivate it instead" message), NOT the raw server message —
 * every other status still falls back to `ApiError.message` /
 * `genericError`, same as every other delete-confirm dialog in this
 * codebase.
 */
export function DeleteAccountButton({ account }: { account: AccountResponseDto }) {
  const t = useTranslations("accounting.accounts.deleteDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const deleteMutation = useDeleteAccount();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  async function handleConfirm() {
    setError(null);
    try {
      await deleteMutation.mutateAsync(account.id);
      setOpen(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(t("hasPostingsError"));
      } else {
        setError(err instanceof ApiError ? err.message : t("genericError"));
      }
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
          <DialogDescription>{t("description", { code: account.code, name: account.name })}</DialogDescription>
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
          <Button type="button" variant="destructive" onClick={() => void handleConfirm()} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? t("deleting") : tCommon("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

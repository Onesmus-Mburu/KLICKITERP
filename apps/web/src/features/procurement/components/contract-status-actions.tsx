"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useMarkContractExpired, useTerminateContract, type ContractResponseDto } from "../hooks/use-contracts";

/**
 * Phase 6 Slice 18 Part 5 (Procurement, Module 12) — `terminate()`/
 * `markExpired()`, both ACTIVE-only and both terminal (no path back to
 * ACTIVE from either — confirmed by reading
 * `ContractsService.transitionStatus()` directly). Both get a confirm
 * dialog, not a direct click — the same "consequential, irreversible
 * transition = confirm dialog" precedent `<PoStatusActions>`'s own Issue
 * button and `supplier-invoices/[id]/page.tsx`'s own Post button already
 * established, even though neither call here carries a request body.
 * Renders nothing once the contract has already left ACTIVE (both actions
 * would just 422 — `ContractsService.transitionStatus()`'s own `from`-status
 * guard — so this component self-gates instead of surfacing that as a live
 * error).
 */
export function ContractStatusActions({ contract }: { contract: ContractResponseDto }) {
  const t = useTranslations("procurement.contracts.statusActions");
  const tCommon = useTranslations("common");

  const [terminateOpen, setTerminateOpen] = React.useState(false);
  const [terminateError, setTerminateError] = React.useState<string | null>(null);
  const [expireOpen, setExpireOpen] = React.useState(false);
  const [expireError, setExpireError] = React.useState<string | null>(null);

  const terminateMutation = useTerminateContract();
  const expireMutation = useMarkContractExpired();

  function handleTerminateOpenChange(next: boolean) {
    setTerminateOpen(next);
    if (next) setTerminateError(null);
  }

  async function handleTerminate() {
    setTerminateError(null);
    try {
      await terminateMutation.mutateAsync(contract.id);
      setTerminateOpen(false);
    } catch (err) {
      setTerminateError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  function handleExpireOpenChange(next: boolean) {
    setExpireOpen(next);
    if (next) setExpireError(null);
  }

  async function handleMarkExpired() {
    setExpireError(null);
    try {
      await expireMutation.mutateAsync(contract.id);
      setExpireOpen(false);
    } catch (err) {
      setExpireError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  if (contract.status !== "ACTIVE") return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dialog open={expireOpen} onOpenChange={handleExpireOpenChange}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline">
            {t("markExpiredTrigger")}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("markExpiredConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("markExpiredConfirmDescription", { title: contract.title })}</DialogDescription>
          </DialogHeader>
          {expireError && (
            <Alert variant="destructive">
              <AlertDescription>{expireError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setExpireOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="button" onClick={() => void handleMarkExpired()} disabled={expireMutation.isPending}>
              {expireMutation.isPending ? t("markingExpired") : t("markExpiredConfirmButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={terminateOpen} onOpenChange={handleTerminateOpenChange}>
        <DialogTrigger asChild>
          <Button type="button" variant="destructive">
            {t("terminateTrigger")}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("terminateConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("terminateConfirmDescription", { title: contract.title })}</DialogDescription>
          </DialogHeader>
          {terminateError && (
            <Alert variant="destructive">
              <AlertDescription>{terminateError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTerminateOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleTerminate()} disabled={terminateMutation.isPending}>
              {terminateMutation.isPending ? t("terminating") : t("terminateConfirmButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

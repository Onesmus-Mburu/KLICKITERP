"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, Info, Plus } from "lucide-react";
import type { CreateFaTransferDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { ApiError } from "@/lib/api-error";
import { useUser } from "@/features/users/hooks/use-users";
import { useUsersLookup } from "../hooks/use-users-lookup";
import { useAcknowledgeTransfer, useCreateTransfer, useTransfersByAsset } from "../hooks/use-transfers";

const LOCATION_MAX_LENGTH = 120; // fa_transfer.to_location — mirrors fa_asset.location's own varchar(120), fa-asset.entity.ts.
const DISABLED_ASSET_STATUSES = new Set(["DISPOSED", "WRITTEN_OFF"]);

/**
 * Phase 6 Slice 23 Part 2 (Fixed Assets, Module 17) — an asset's own
 * `fa_transfer` history (location/custodian handovers) plus the 2 real
 * mutating actions `TransfersController` supports: "New transfer" and a
 * per-row "Acknowledge" action. Embedded on
 * `app/(erp)/fixed-assets/assets/[id]/page.tsx` as its own section — no
 * standalone route exists or is added, matching the exact "no route needed
 * when properly scoped by asset" precedent Payroll Slice 22 Part 3's
 * `employee-assignment-panel.tsx` already established (`TransfersController`
 * has no global "list every transfer across every asset" endpoint either).
 *
 * **No approval chain, and this panel's own copy says so plainly** —
 * confirmed by reading `TransfersService` directly: `create()` is a single,
 * immediate action. It captures the asset's CURRENT `location`/
 * `custodianUserId` as the new row's `from*` fields, then overwrites the
 * asset's own live fields with the supplied `to*` values, both in the same
 * call — `newDialog.noApprovalNote` below states this explicitly, since
 * every OTHER multi-step workflow in this app (requisitions, payment
 * vouchers, budgets, …) submits-then-decides, and a user familiar with that
 * pattern could otherwise assume a transfer needs a second "approve" step
 * that genuinely does not exist.
 *
 * **"New transfer" is disabled once `asset.status` is `DISPOSED`/
 * `WRITTEN_OFF`** — a real DB trigger (`trg_fa_transfer_no_txn_after_disposal`,
 * BR-FA-02) blocks this server-side regardless; not reachable yet this slice
 * (Part 4/Disposals will make it reachable), but the disable condition is
 * wired correctly now, per this part's own task brief.
 *
 * **Per-row "Acknowledge" is a direct-click action, not a dialog** — there
 * is no request body at all (`POST .../acknowledge` takes none), so a
 * confirm dialog would add a step with nothing to actually confirm; mirrors
 * `deposit-withdrawal-status-actions.tsx`'s own dual-acknowledgment buttons
 * (Banking Slice 21 Part 2) for the identical "no-body POST action" shape.
 * Only renders for a row where `ackBy === null` — the real `422` on a second
 * attempt (`` `fa_transfer ${id} has already been acknowledged` ``) is
 * surfaced verbatim via `ApiError.message` if a race ever hits it anyway.
 *
 * **`fromCustodianUserId`/`toCustodianUserId`/`ackBy` are resolved to human
 * names via `useUser()`** (`features/users/hooks/use-users.ts`, the same
 * cross-feature READ-for-display precedent `assets/[id]/page.tsx` already
 * establishes for `custodianUserId`), degrading to the raw id on
 * loading/403/404 — a small local `<CustodianLabel>` below, not a shared
 * component, since it is a one-line wrapper with nothing else to reuse
 * beyond `useUser()` itself.
 *
 * **Rows are trusted server-sorted, not re-sorted client-side** —
 * `FaTransferRepository.findByAssetId()` orders `createdAt DESC` (confirmed
 * by reading it directly, and the controller's own doc comment says "newest
 * first"), unlike `employee-assignment-panel.tsx`'s own defensive client
 * sort (that backend query carries no documented order guarantee) — this one
 * genuinely does, so no redundant client-side sort is added.
 */
export function TransferPanel({ assetId, assetStatus }: { assetId: string; assetStatus: string }) {
  const t = useTranslations("fixedAssets.assets.transferPanel");
  const transfersQuery = useTransfersByAsset(assetId);
  const disabled = DISABLED_ASSET_STATUSES.has(assetStatus);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold tracking-tight">{t("sectionTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("sectionHint")}</p>
      </div>

      <Alert>
        <Info className="size-4" />
        <AlertDescription>{t("noApprovalNote")}</AlertDescription>
      </Alert>

      <QueryBoundary query={transfersQuery} isEmpty={(d) => d.length === 0}>
        {(rows) => (
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("fromColumn")}</TableHead>
                  <TableHead>{t("toColumn")}</TableHead>
                  <TableHead>{t("atColumn")}</TableHead>
                  <TableHead>{t("statusColumn")}</TableHead>
                  <TableHead className="w-32">{t("actionsColumn")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p className="text-sm text-foreground">{row.fromLocation}</p>
                        {row.fromCustodianUserId && (
                          <p className="text-xs text-muted-foreground">
                            <CustodianLabel id={row.fromCustodianUserId} />
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p className="text-sm text-foreground">{row.toLocation}</p>
                        {row.toCustodianUserId && (
                          <p className="text-xs text-muted-foreground">
                            <CustodianLabel id={row.toCustodianUserId} />
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{new Date(row.at).toLocaleString()}</TableCell>
                    <TableCell>
                      {row.ackBy ? (
                        <Badge variant="soft-success">
                          {t("statusAcknowledged")} · <CustodianLabel id={row.ackBy} />
                        </Badge>
                      ) : (
                        <Badge variant="soft-warning">{t("statusPending")}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{row.ackBy === null && <AcknowledgeButton transferId={row.id} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </QueryBoundary>

      <div>
        <NewTransferDialog assetId={assetId} disabled={disabled} />
        {disabled && <p className="mt-1.5 text-xs text-muted-foreground">{t("disabledHint")}</p>}
      </div>
    </div>
  );
}

function CustodianLabel({ id }: { id: string }) {
  const query = useUser(id);
  if (query.isLoading) return <span>…</span>;
  if (query.isError || !query.data) return <span title={id}>{id.slice(0, 8)}…</span>;
  return <span>{query.data.fullName}</span>;
}

function AcknowledgeButton({ transferId }: { transferId: string }) {
  const t = useTranslations("fixedAssets.assets.transferPanel");
  const [error, setError] = React.useState<string | null>(null);
  const ackMutation = useAcknowledgeTransfer();

  async function handleAcknowledge() {
    setError(null);
    try {
      await ackMutation.mutateAsync(transferId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-1">
      <Button type="button" size="sm" variant="outline" onClick={() => void handleAcknowledge()} disabled={ackMutation.isPending}>
        <Check className="size-4" />
        {ackMutation.isPending ? t("acknowledging") : t("acknowledgeAction")}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function NewTransferDialog({ assetId, disabled }: { assetId: string; disabled: boolean }) {
  const t = useTranslations("fixedAssets.assets.transferPanel.newDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [toLocation, setToLocation] = React.useState("");
  const [toCustodianUserId, setToCustodianUserId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateTransfer();
  const usersQuery = useUsersLookup();

  const userItems = React.useMemo(
    () => (usersQuery.data?.items ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})` })),
    [usersQuery.data],
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setToLocation("");
      setToCustodianUserId("");
      setError(null);
    }
  }

  const canSubmit = toLocation.trim().length > 0 && !createMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: CreateFaTransferDto = {
      assetId,
      toLocation: toLocation.trim(),
      ...(toCustodianUserId ? { toCustodianUserId } : {}),
    };
    try {
      await createMutation.mutateAsync(dto);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" disabled={disabled}>
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
            <Label required>{t("toLocationLabel")}</Label>
            <Input
              value={toLocation}
              maxLength={LOCATION_MAX_LENGTH}
              onChange={(e) => setToLocation(e.target.value)}
              placeholder={t("toLocationPlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("toCustodianLabel")}</Label>
            <Combobox
              items={userItems}
              value={toCustodianUserId}
              onChange={setToCustodianUserId}
              placeholder={usersQuery.isLoading ? t("loadingUsers") : t("toCustodianPlaceholder")}
              searchPlaceholder={t("toCustodianSearchPlaceholder")}
              emptyText={t("toCustodianEmptyText")}
              disabled={usersQuery.isLoading}
            />
            <p className="text-xs text-muted-foreground">{t("toCustodianHint")}</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {createMutation.isPending ? t("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Plus } from "lucide-react";
import type { CompleteFaMaintenanceDto, ScheduleFaMaintenanceDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { ApiError } from "@/lib/api-error";
import { useCompleteMaintenance, useMaintenanceByAsset, useScheduleMaintenance } from "../hooks/use-maintenance";

const FA_MAINTENANCE_KINDS = ["PLANNED", "REPAIR"] as const;
const DOWNTIME_NOTE_MAX_LENGTH = 2000; // fa_maintenance.downtime_note is a plain `text` column — no hard server-side cap, this is a UX guard only.
const DISABLED_ASSET_STATUSES = new Set(["DISPOSED", "WRITTEN_OFF"]);

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

/**
 * Phase 6 Slice 23 Part 2 (Fixed Assets, Module 17) — an asset's own
 * `fa_maintenance` history (planned/repair events) plus the 2 real mutating
 * actions `MaintenanceController` supports: "Schedule maintenance" and a
 * per-row "Complete" action. Embedded on
 * `app/(erp)/fixed-assets/assets/[id]/page.tsx` as its own section, same "no
 * standalone route — every list route is asset-scoped" reasoning
 * `transfer-panel.tsx`'s own doc comment gives.
 *
 * **"Schedule maintenance" immediately flips the asset's own status to
 * `UNDER_MAINTENANCE` — even for a `PLANNED` event that hasn't started
 * yet.** Confirmed by reading `MaintenanceService.schedule()` directly, a
 * real, deliberate design choice (the controller's own doc comment: "even a
 * scheduled-but-not-started event marks the asset unavailable"). The
 * schedule dialog's own `description`/`immediateStatusNote` state this
 * plainly so a user isn't surprised the asset becomes unavailable the
 * instant a future-dated PLANNED event is created, not just once a REPAIR
 * genuinely starts.
 *
 * **"Complete" unconditionally force-sets the asset's status back to
 * `ACTIVE`**, regardless of what status the asset carried before/during
 * maintenance (confirmed by reading `complete()` directly) — a real, honest
 * quirk, not something this panel works around; no client-side guard is
 * needed since this is simply the backend's own real behavior.
 *
 * **"Schedule maintenance" is disabled once `asset.status` is `DISPOSED`/
 * `WRITTEN_OFF`** — same BR-FA-02 real DB trigger reasoning
 * `transfer-panel.tsx`'s own doc comment gives for its own create action;
 * not reachable yet this slice, wired correctly now per this part's own task
 * brief.
 *
 * **`costExpenseVoucherId` on the "Complete" dialog is a plain optional
 * text-uuid input, not a real picker** — a deliberate judgment call, per
 * this part's own task brief: this field references an ALREADY-CREATED
 * `exp_voucher` (`complete()` never creates one itself, confirmed by reading
 * `CompleteFaMaintenanceDto`'s own doc comment), and no cheap existing
 * expense-voucher combobox exists in this session's own scope to reuse — the
 * same "plain optional uuid text input, not a new cross-feature picker"
 * judgment call `create-asset-dialog.tsx`'s own `supplierId`/`poId`/`grnId`
 * fields already established for an identical class of gap. **This field is
 * a real, live-confirmed FK to `exp_voucher`** (unlike this part's own task
 * brief's assumption that it "isn't validated for existence at this
 * layer") — a bad id previously 500'd before this part's own backend fix
 * (`fk_fa_maintenance_cost_expense_voucher_id`, see
 * `maintenance.api.ts`'s own doc comment); the hint below states the id must
 * reference a real voucher, and a bad one now surfaces the fix's own clean
 * `422` verbatim via `ApiError.message`, not a raw `500`.
 *
 * **Rows are trusted server-sorted, not re-sorted client-side** — same
 * reasoning as `transfer-panel.tsx`'s own doc comment
 * (`FaMaintenanceRepository.findByAssetId()` orders `createdAt DESC`,
 * confirmed by reading it directly).
 */
export function MaintenancePanel({ assetId, assetStatus }: { assetId: string; assetStatus: string }) {
  const t = useTranslations("fixedAssets.assets.maintenancePanel");
  const tKinds = useTranslations("fixedAssets.maintenanceKinds");
  const maintenanceQuery = useMaintenanceByAsset(assetId);
  const disabled = DISABLED_ASSET_STATUSES.has(assetStatus);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold tracking-tight">{t("sectionTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("sectionHint")}</p>
      </div>

      <QueryBoundary query={maintenanceQuery} isEmpty={(d) => d.length === 0}>
        {(rows) => (
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("kindColumn")}</TableHead>
                  <TableHead>{t("scheduledOnColumn")}</TableHead>
                  <TableHead>{t("doneOnColumn")}</TableHead>
                  <TableHead>{t("downtimeNoteColumn")}</TableHead>
                  <TableHead>{t("statusColumn")}</TableHead>
                  <TableHead className="w-32">{t("actionsColumn")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{tKinds(row.kind)}</TableCell>
                    <TableCell>{row.scheduledOn ?? "—"}</TableCell>
                    <TableCell>{row.doneOn ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate" title={row.downtimeNote || undefined}>
                      {row.downtimeNote || "—"}
                    </TableCell>
                    <TableCell>
                      {row.doneOn ? (
                        <Badge variant="soft-success">{t("statusComplete")}</Badge>
                      ) : (
                        <Badge variant="soft-warning">{t("statusOpen")}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{row.doneOn === null && <CompleteMaintenanceDialog maintenanceId={row.id} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </QueryBoundary>

      <div>
        <ScheduleMaintenanceDialog assetId={assetId} disabled={disabled} />
        {disabled && <p className="mt-1.5 text-xs text-muted-foreground">{t("disabledHint")}</p>}
      </div>
    </div>
  );
}

function ScheduleMaintenanceDialog({ assetId, disabled }: { assetId: string; disabled: boolean }) {
  const t = useTranslations("fixedAssets.assets.maintenancePanel.scheduleDialog");
  const tKinds = useTranslations("fixedAssets.maintenanceKinds");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<(typeof FA_MAINTENANCE_KINDS)[number]>("PLANNED");
  const [scheduledOn, setScheduledOn] = React.useState("");
  const [downtimeNote, setDowntimeNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const scheduleMutation = useScheduleMaintenance();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setKind("PLANNED");
      setScheduledOn("");
      setDowntimeNote("");
      setError(null);
    }
  }

  const canSubmit = !scheduleMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: ScheduleFaMaintenanceDto = {
      assetId,
      kind,
      ...(scheduledOn ? { scheduledOn } : {}),
      ...(downtimeNote.trim() ? { downtimeNote: downtimeNote.trim() } : {}),
    };
    try {
      await scheduleMutation.mutateAsync(dto);
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

        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertDescription>{t("immediateStatusNote")}</AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("kindLabel")}</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as (typeof FA_MAINTENANCE_KINDS)[number])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FA_MAINTENANCE_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {tKinds(k)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("scheduledOnLabel")}</Label>
            <Input type="date" value={scheduledOn} onChange={(e) => setScheduledOn(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("scheduledOnHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("downtimeNoteLabel")}</Label>
            <Textarea
              value={downtimeNote}
              maxLength={DOWNTIME_NOTE_MAX_LENGTH}
              onChange={(e) => setDowntimeNote(e.target.value)}
              placeholder={t("downtimeNotePlaceholder")}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {scheduleMutation.isPending ? t("scheduling") : t("scheduleButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteMaintenanceDialog({ maintenanceId }: { maintenanceId: string }) {
  const t = useTranslations("fixedAssets.assets.maintenancePanel.completeDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [doneOn, setDoneOn] = React.useState(todayIsoDate());
  const [downtimeNote, setDowntimeNote] = React.useState("");
  const [costExpenseVoucherId, setCostExpenseVoucherId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const completeMutation = useCompleteMaintenance();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setDoneOn(todayIsoDate());
      setDowntimeNote("");
      setCostExpenseVoucherId("");
      setError(null);
    }
  }

  const canSubmit = !!doneOn && !completeMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: CompleteFaMaintenanceDto = {
      doneOn,
      ...(downtimeNote.trim() ? { downtimeNote: downtimeNote.trim() } : {}),
      ...(costExpenseVoucherId.trim() ? { costExpenseVoucherId: costExpenseVoucherId.trim() } : {}),
    };
    try {
      await completeMutation.mutateAsync({ id: maintenanceId, dto });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <CheckCircle2 className="size-4" />
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
            <Label required>{t("doneOnLabel")}</Label>
            <Input type="date" value={doneOn} onChange={(e) => setDoneOn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("downtimeNoteLabel")}</Label>
            <Textarea
              value={downtimeNote}
              maxLength={DOWNTIME_NOTE_MAX_LENGTH}
              onChange={(e) => setDowntimeNote(e.target.value)}
              placeholder={t("downtimeNotePlaceholder")}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">{t("downtimeNoteHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("costExpenseVoucherIdLabel")}</Label>
            <Input value={costExpenseVoucherId} onChange={(e) => setCostExpenseVoucherId(e.target.value)} placeholder={t("costExpenseVoucherIdPlaceholder")} />
            <p className="text-xs text-muted-foreground">{t("costExpenseVoucherIdHint")}</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {completeMutation.isPending ? t("completing") : t("completeButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

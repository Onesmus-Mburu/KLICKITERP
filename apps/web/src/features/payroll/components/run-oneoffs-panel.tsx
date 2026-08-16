"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Info, Pencil, Trash2 } from "lucide-react";
import type { PyrlOneoffResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyInput } from "@/components/patterns/money-input";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { ApiError } from "@/lib/api-error";
import { formatMoney, normalizeMoneyInput } from "@/lib/money";
import { useComponents } from "../hooks/use-components";
import { useEmployees } from "../hooks/use-employees";
import { useDeleteOneoff, useOneoffsByPeriod, useUpdateOneoff } from "../hooks/use-oneoffs";
import { CreateOneoffDialog } from "./create-oneoff-dialog";

/**
 * Phase 6 Slice 22 Part 6 (Payroll, Module 15) — the run detail page's
 * one-offs panel, period-scoped via `GET /payroll/oneoffs?periodKey=` (every
 * one-off queued for this run's own period, across every employee — NOT a
 * per-employee list, confirmed by reading `OneoffsController.list()`
 * directly). **Deliberately NOT a standalone `/payroll/one-offs` nav route**
 * — per the task brief's own explicit instruction, one-offs are
 * period-scoped and most useful managed directly from a run's own detail
 * page, the same "no standalone route needed when properly scoped
 * elsewhere" judgment call Part 3 already made for assignments/overrides.
 *
 * **The "consumed at compute time" honesty note is load-bearing, not
 * decorative** — a one-off has no status/lifecycle field at all; it becomes
 * effectively frozen in practice once a run has consumed it (nothing stops
 * editing/deleting it after, but doing so has no retroactive effect on an
 * already-computed run's lines — only a RECOMPUTE picks up the change). The
 * alert below states this plainly so an admin editing a one-off after this
 * run has already been computed doesn't assume the change applied
 * automatically.
 */
export function RunOneoffsPanel({ periodKey }: { periodKey: string }) {
  const t = useTranslations("payroll.oneoffs.panel");
  const oneoffsQuery = useOneoffsByPeriod(periodKey);
  const employeesQuery = useEmployees();
  const componentsQuery = useComponents();

  const employeeLabelById = React.useMemo(
    () => new Map((employeesQuery.data ?? []).map((e) => [e.id, `${e.staffNo} — ${e.fullName}`])),
    [employeesQuery.data],
  );
  const componentLabelById = React.useMemo(
    () => new Map((componentsQuery.data ?? []).map((c) => [c.id, `${c.code} — ${c.name}`])),
    [componentsQuery.data],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <CreateOneoffDialog periodKey={periodKey} />
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Info className="size-4" />
          <AlertDescription>{t("consumedHint")}</AlertDescription>
        </Alert>

        <QueryBoundary query={oneoffsQuery} isEmpty={(d) => d.length === 0}>
          {(oneoffs) => (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columns.employee")}</TableHead>
                    <TableHead>{t("columns.kind")}</TableHead>
                    <TableHead>{t("columns.component")}</TableHead>
                    <TableHead>{t("columns.amount")}</TableHead>
                    <TableHead>{t("columns.reason")}</TableHead>
                    <TableHead className="w-20">{t("columns.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {oneoffs.map((oneoff) => (
                    <TableRow key={oneoff.id}>
                      <TableCell>{employeeLabelById.get(oneoff.employeeId) ?? oneoff.employeeId}</TableCell>
                      <TableCell>
                        <KindBadge kind={oneoff.kind} />
                      </TableCell>
                      <TableCell>{componentLabelById.get(oneoff.componentId) ?? oneoff.componentId}</TableCell>
                      <TableCell>{formatMoney(oneoff.amount)}</TableCell>
                      <TableCell className="max-w-xs">
                        <span className="line-clamp-2 text-sm text-muted-foreground">{oneoff.reason}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <EditOneoffDialog oneoff={oneoff} />
                          <DeleteOneoffDialog oneoff={oneoff} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </QueryBoundary>
      </CardContent>
    </Card>
  );
}

function KindBadge({ kind }: { kind: PyrlOneoffResponseDto["kind"] }) {
  const t = useTranslations("payroll.oneoffs.kinds");
  return <Badge variant={kind === "EARNING" ? "soft-success" : "soft-destructive"}>{t(kind)}</Badge>;
}

function EditOneoffDialog({ oneoff }: { oneoff: PyrlOneoffResponseDto }) {
  const t = useTranslations("payroll.oneoffs.editDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState(oneoff.amount);
  const [reason, setReason] = React.useState(oneoff.reason);
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateOneoff();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setAmount(oneoff.amount);
      setReason(oneoff.reason);
      setError(null);
    }
  }

  const normalizedAmount = normalizeMoneyInput(amount);
  const canSubmit = normalizedAmount !== null && reason.trim().length > 0 && !updateMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit || normalizedAmount === null) return;
    setError(null);
    try {
      await updateMutation.mutateAsync({ id: oneoff.id, dto: { amount: normalizedAmount, reason: reason.trim() } });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={tCommon("edit")}>
          <Pencil className="size-4" />
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
            <Label required>{t("amountLabel")}</Label>
            <MoneyInput value={amount} onValueChange={(v) => setAmount(v ?? "")} />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("reasonLabel")}</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {updateMutation.isPending ? t("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteOneoffDialog({ oneoff }: { oneoff: PyrlOneoffResponseDto }) {
  const t = useTranslations("payroll.oneoffs.deleteDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const deleteMutation = useDeleteOneoff();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  async function handleConfirm() {
    setError(null);
    try {
      await deleteMutation.mutateAsync({ id: oneoff.id, periodKey: oneoff.periodKey });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="text-destructive hover:bg-tint-destructive hover:text-destructive" aria-label={tCommon("delete")}>
          <Trash2 className="size-4" />
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

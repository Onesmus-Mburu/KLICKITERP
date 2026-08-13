"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { PackageCheck } from "lucide-react";
import type { ReceiveGrnDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/patterns/money-input";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { normalizeMoneyInput, sumMoneyStrings } from "@/lib/money";
import { ApiError } from "@/lib/api-error";
import { usePurchaseOrderLines, type PurchaseOrder } from "../hooks/use-purchase-orders";
import { useReceiveGrn } from "../hooks/use-grn";

const RECEIVABLE_STATUSES = new Set(["ISSUED", "PARTIALLY_RECEIVED"]);

interface GrnLineFormRow {
  poLineId: string;
  description: string;
  orderedQty: string;
  alreadyReceivedQty: string;
  remainingQty: string;
  fullyReceived: boolean;
  receivedQty: string;
  rejectedQty: string;
  rejectionReason: string;
  unitCost: string;
}

/** `orderedQty - alreadyReceivedQty`, via `sumMoneyStrings`'s own negation trick (no dedicated subtract helper exists in `lib/money.ts`, confirmed by reading it directly) — never `parseFloat`. Clamped to `"0"` (never negative) purely for DISPLAY/defaulting; the real ceiling enforcement is entirely server-side (`GrnService.receive()`'s own tolerance check), this is just a sane starting point for the input. */
function remainingQty(ordered: string, alreadyReceived: string): string {
  const negatedAlreadyReceived = alreadyReceived.startsWith("-") ? alreadyReceived.slice(1) : `-${alreadyReceived}`;
  const raw = sumMoneyStrings([ordered, negatedAlreadyReceived]);
  return isPositiveDecimalString(raw) ? raw : "0";
}

/** A BigInt-safe positive check (any nonzero digit in a non-negative decimal string) — avoids `parseFloat`/`Number()` on a money value anywhere in this app, matching `lib/money.ts`'s own established discipline. */
function isPositiveDecimalString(value: string): boolean {
  const normalized = normalizeMoneyInput(value);
  if (normalized === null || normalized.startsWith("-")) return false;
  return /[1-9]/.test(normalized);
}

function buildRows(lines: { id: string; description: string; qty: string; unitPrice: string; receivedQty: string }[]): GrnLineFormRow[] {
  return lines.map((line) => {
    const remaining = remainingQty(line.qty, line.receivedQty);
    const fullyReceived = !isPositiveDecimalString(remaining);
    return {
      poLineId: line.id,
      description: line.description,
      orderedQty: line.qty,
      alreadyReceivedQty: line.receivedQty,
      remainingQty: remaining,
      fullyReceived,
      receivedQty: fullyReceived ? "" : remaining,
      rejectedQty: "0",
      rejectionReason: "",
      unitCost: line.unitPrice,
    };
  });
}

/**
 * Phase 6 Slice 18 Part 4 (Procurement, Module 12) — `POST .../grn/receive`,
 * BR-PROC-01/BR-PROC-03. Per PO line: ordered qty, already-received qty
 * (`PurchaseOrderLineResponseDto.receivedQty` — this is exactly the field
 * `purchase-orders/[id]/page.tsx`'s own lines table already shows and
 * documented as "always `0.0000` today ... GRN, out of Part 3's own scope" —
 * THIS is the part that finally moves it), a "receive now" input defaulting
 * to the remaining outstanding amount, plus rejected qty/reason/unit cost —
 * exactly the shape the task brief specifies.
 *
 * **Can be opened and submitted MULTIPLE times against the same PO** (a real
 * partial receipt, then a later follow-up receipt) — every open re-fetches
 * `usePurchaseOrderLines(po.id)` fresh (not cached from a stale earlier open)
 * so `alreadyReceivedQty`/`remainingQty` always reflect the PO's real current
 * state, including any receiving that happened in a prior dialog session.
 *
 * **Tolerance is NOT pre-validated client-side** — `GrnService.receive()`'s
 * own per-line ceiling (Settings-configurable, default 5%, clamped to the DB
 * trigger's hard 5% backstop) is read from `SettingsService` server-side only;
 * there's no client-reachable endpoint for it. A receive that exceeds it
 * surfaces as a real, honest `ApiError` (BR-PROC-03's own message), not a
 * silently-blocked submit button.
 *
 * **Only rows with a real, positive `receivedQty` are included in the
 * submitted `ReceiveGrnDto.lines`** — a fully-received line's input is
 * disabled and excluded entirely (the DTO's own `@ArrayNotEmpty()` still
 * requires at least one real line across the whole submission).
 */
export function ReceiveGrnDialog({ po }: { po: PurchaseOrder }) {
  const t = useTranslations("procurement.grn.receiveDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [rows, setRows] = React.useState<GrnLineFormRow[]>([]);
  const [rowsSeeded, setRowsSeeded] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const linesQuery = usePurchaseOrderLines(open ? po.id : undefined);
  const receiveMutation = useReceiveGrn();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setRows([]);
      setRowsSeeded(false);
      setNotes("");
      setError(null);
    }
  }

  React.useEffect(() => {
    if (open && !rowsSeeded && linesQuery.data) {
      setRows(buildRows(linesQuery.data));
      setRowsSeeded(true);
    }
  }, [open, rowsSeeded, linesQuery.data]);

  function patchRow(poLineId: string, patch: Partial<GrnLineFormRow>) {
    setRows((prev) => prev.map((row) => (row.poLineId === poLineId ? { ...row, ...patch } : row)));
  }

  const includedRows = rows.filter((row) => !row.fullyReceived && isPositiveDecimalString(row.receivedQty));
  const canSubmit = includedRows.length > 0 && includedRows.every((row) => normalizeMoneyInput(row.unitCost) !== null) && !receiveMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: ReceiveGrnDto = {
      poId: po.id,
      lines: includedRows.map((row) => ({
        poLineId: row.poLineId,
        receivedQty: normalizeMoneyInput(row.receivedQty) ?? "0",
        rejectedQty: normalizeMoneyInput(row.rejectedQty) ?? "0",
        ...(row.rejectionReason.trim() ? { rejectionReason: row.rejectionReason.trim() } : {}),
        unitCost: normalizeMoneyInput(row.unitCost) ?? "0",
      })),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    try {
      await receiveMutation.mutateAsync(dto);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  if (!RECEIVABLE_STATUSES.has(po.status)) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
          <PackageCheck className="size-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { number: po.number })}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <QueryBoundary query={linesQuery} isEmpty={(d) => d.length === 0}>
          {() => (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("columns.description")}</TableHead>
                      <TableHead className="w-24">{t("columns.ordered")}</TableHead>
                      <TableHead className="w-28">{t("columns.alreadyReceived")}</TableHead>
                      <TableHead className="w-24">{t("columns.remaining")}</TableHead>
                      <TableHead className="w-28">{t("columns.receiveNow")}</TableHead>
                      <TableHead className="w-28">{t("columns.rejected")}</TableHead>
                      <TableHead className="w-40">{t("columns.rejectionReason")}</TableHead>
                      <TableHead className="w-32">{t("columns.unitCost")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.poLineId}>
                        <TableCell className="min-w-[180px]">{row.description}</TableCell>
                        <TableCell>{row.orderedQty}</TableCell>
                        <TableCell>{row.alreadyReceivedQty}</TableCell>
                        <TableCell>
                          {row.fullyReceived ? <span className="text-xs text-muted-foreground">{t("fullyReceivedHint")}</span> : row.remainingQty}
                        </TableCell>
                        <TableCell>
                          <Input
                            inputMode="decimal"
                            value={row.receivedQty}
                            disabled={row.fullyReceived}
                            onChange={(e) => patchRow(row.poLineId, { receivedQty: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            inputMode="decimal"
                            value={row.rejectedQty}
                            disabled={row.fullyReceived}
                            onChange={(e) => patchRow(row.poLineId, { rejectedQty: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row.rejectionReason}
                            disabled={row.fullyReceived}
                            placeholder={t("rejectionReasonPlaceholder")}
                            onChange={(e) => patchRow(row.poLineId, { rejectionReason: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <MoneyInput
                            value={row.unitCost}
                            disabled={row.fullyReceived}
                            onValueChange={(v) => patchRow(row.poLineId, { unitCost: v ?? "" })}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-1.5">
                <Label>{t("notesLabel")}</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("notesPlaceholder")} />
              </div>
            </div>
          )}
        </QueryBoundary>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {receiveMutation.isPending ? t("receiving") : t("receiveButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

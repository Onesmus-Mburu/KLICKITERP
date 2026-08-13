"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { ApiError } from "@/lib/api-error";
import { isDraftPlaceholderNumber } from "../hooks/use-purchase-orders";
import { useGrnsByPo, usePostGrn, type Grn } from "../hooks/use-grn";

const GRN_STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  POSTED: "soft-success",
};

/**
 * Phase 6 Slice 18 Part 4 (Procurement, Module 12) — a PO's own GRN history,
 * per the task brief's own instruction ("add ... a GRN history section" to
 * the PO detail page). **No dedicated `/procurement/grn` route exists at
 * all** — see `grn.api.ts`'s own doc comment for the full reasoning (the
 * list endpoint's `poId` is genuinely required, and there's no sensible
 * "browse every GRN" use case this slice's plan calls for); this list + its
 * inline Post action IS the complete GRN-history UI, living entirely inside
 * `purchase-orders/[id]/page.tsx`.
 *
 * **`isDraftPlaceholderNumber()` is reused as-is from `use-purchase-orders.ts`** —
 * a GRN's own placeholder number is allocated the identical way
 * (`GrnService.receive()`: `` `DRAFT-${grnId...}` ``, confirmed by reading it
 * directly), so the exact same prefix check applies without duplicating it.
 *
 * Posting is a real, irreversible GL posting (P-18/P-19) — matching
 * `<PoStatusActions>`'s own established "consequential transition = confirm
 * dialog even with no request body" precedent (Issue), not the lighter
 * "no-body = direct click" treatment `RequisitionStatusActions`'s own
 * Submit/Cancel use for less consequential ones.
 */
export function GrnList({ poId }: { poId: string }) {
  const t = useTranslations("procurement.grn.list");
  const grnsQuery = useGrnsByPo(poId);

  return (
    <QueryBoundary query={grnsQuery} isEmpty={(d) => d.length === 0}>
      {(grns) => (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.number")}</TableHead>
                <TableHead>{t("columns.receivedAt")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead>{t("columns.journal")}</TableHead>
                <TableHead>{t("columns.notes")}</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {grns.map((grn) => (
                <TableRow key={grn.id}>
                  <TableCell>{isDraftPlaceholderNumber(grn.number) ? <span className="text-muted-foreground">{t("notYetPosted")}</span> : grn.number}</TableCell>
                  <TableCell>{new Date(grn.receivedAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={GRN_STATUS_BADGE_VARIANT[grn.status] ?? "outline"}>{t(`statuses.${grn.status}`)}</Badge>
                  </TableCell>
                  <TableCell>
                    {grn.journalId ? (
                      <Link href={`/accounting/journals/${grn.journalId}`} className="text-primary hover:underline">
                        {t("viewJournal")}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate">{grn.notes ?? "—"}</TableCell>
                  <TableCell>{grn.status === "DRAFT" && <PostGrnButton grn={grn} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </QueryBoundary>
  );
}

function PostGrnButton({ grn }: { grn: Grn }) {
  const t = useTranslations("procurement.grn.list");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const postMutation = usePostGrn();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  async function handlePost() {
    setError(null);
    try {
      await postMutation.mutateAsync(grn.id);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Send className="size-4" />
          {t("postTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("postConfirmTitle")}</DialogTitle>
          <DialogDescription>{t("postConfirmDescription")}</DialogDescription>
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
          <Button type="button" onClick={() => void handlePost()} disabled={postMutation.isPending}>
            {postMutation.isPending ? t("posting") : t("postConfirmButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

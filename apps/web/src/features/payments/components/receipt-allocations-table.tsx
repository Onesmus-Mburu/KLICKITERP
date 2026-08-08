"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReceiptAllocationResponseDto } from "@klickit/contracts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";

/**
 * Renders ONLY what `GET /payments/receipts/{id}` actually returned —
 * allocations are server-computed oldest-invoice-first by
 * `AllocationService.resolveAllocations()` (BR-PAY-03); this component never
 * computes/previews an allocation client-side, per the plan's explicit
 * instruction.
 *
 * Phase 6 Slice 8 (Part 4) display polish: a non-`toPrepayment` row now links
 * the REAL invoice number the backend resolved (`alloc.invoiceNumber`, e.g.
 * `BIL-000047`) instead of the generic word "Invoice" — falls back to that
 * generic label only in the defensive/should-never-happen case of a non-null
 * `invoiceId` with a `null` `invoiceNumber`. A `toPrepayment:true` row now
 * renders a visually distinct `soft-warning` `<Badge>` ("Overpayment / credit
 * balance") instead of blending in as plain cell text — reusing this
 * codebase's existing `badge.tsx` variant (no new CSS), the same tinted-pill
 * treatment `InvoiceStatusBadge`/`KpiCard`'s tone icons already establish.
 */
export function ReceiptAllocationsTable({ allocations }: { allocations: ReceiptAllocationResponseDto[] }) {
  const t = useTranslations("payments.receiptDetail.allocationsTable");

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("target")}</TableHead>
            <TableHead>{t("amount")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allocations.map((alloc) => (
            <TableRow key={alloc.id}>
              <TableCell>
                {alloc.toPrepayment ? (
                  <Badge variant="soft-warning">{t("prepayment")}</Badge>
                ) : alloc.invoiceId ? (
                  <Link href={`/billing/invoices/${alloc.invoiceId}`} className="text-primary hover:underline">
                    {alloc.invoiceNumber ?? t("invoice")}
                  </Link>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>{formatMoney(alloc.amount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

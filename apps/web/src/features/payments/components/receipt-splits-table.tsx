"use client";

import { useTranslations } from "next-intl";
import type { ReceiptSplitResponseDto } from "@klickit/contracts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/money";

/** Renders ONLY what `GET /payments/receipts/{id}` actually returned — never computed/derived client-side, per the plan's explicit instruction (allocations/splits are server-computed and only ever displayed here, not previewed or recalculated). */
export function ReceiptSplitsTable({ splits }: { splits: ReceiptSplitResponseDto[] }) {
  const t = useTranslations("payments.receiptDetail.splitsTable");
  const tMethod = useTranslations("payments.splitMethods");

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("method")}</TableHead>
            <TableHead>{t("amount")}</TableHead>
            <TableHead>{t("reference")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {splits.map((split) => (
            <TableRow key={split.id}>
              <TableCell>{tMethod(split.method)}</TableCell>
              <TableCell>{formatMoney(split.amount)}</TableCell>
              <TableCell className="text-muted-foreground">{split.externalRef ?? split.chequeId ?? split.bankAccountId ?? split.mpesaTransactionId ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

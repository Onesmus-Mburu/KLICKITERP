"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { IssueTransferDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { useStores } from "../hooks/use-stores";
import { useIssueTransfer } from "../hooks/use-transfers";
import { emptyTransferLineRow, isTransferLineRowComplete, transferLineRowsToDto, type TransferLineFormRow } from "../lib/transfer-lines";
import { TransferLineEditor } from "./transfer-line-editor";

/**
 * Phase 6 Slice 19 Part 2 (Stock Movements + Transfers, Module 13) — the
 * transfer-issue form, a dedicated PAGE component rather than a dialog — the
 * same "dialog vs. dedicated page" call `journal-entry-form.tsx` (Slice 17
 * Part 2) already made for a similarly dynamic, multi-row line editor: a
 * repeatable item/qty/unitCost table reads far better with a full page's
 * width than cramped inside a `<Dialog>`'s max-width content area.
 *
 * **No "Save Draft" affordance anywhere — the submit button reads "Issue
 * Transfer"** (`submitButton` copy), per this part's own explicit UX
 * instruction: `IssueTransferDto` has no DRAFT state, submitting this form
 * genuinely moves stock out of `fromStoreId` immediately
 * (`TransfersService.issue()`'s own `TRANSFER_OUT` recording inside the same
 * transaction as the header/lines insert).
 *
 * `fromStoreId !== toStoreId` is validated CLIENT-SIDE here (`canSubmit`)
 * in addition to the server's own real 422 (`TransfersService.issue()`'s
 * `input.fromStoreId === input.toStoreId` check) — per this part's own
 * explicit "validate client-side too, not just rely on the server 422"
 * instruction.
 */
export function TransferForm() {
  const t = useTranslations("inventory.transfers.create");
  const router = useRouter();
  const [fromStoreId, setFromStoreId] = React.useState("");
  const [toStoreId, setToStoreId] = React.useState("");
  const [rows, setRows] = React.useState<TransferLineFormRow[]>(() => [emptyTransferLineRow()]);
  const [error, setError] = React.useState<string | null>(null);

  const storesQuery = useStores(true);
  const issueMutation = useIssueTransfer();

  const storesDiffer = !!fromStoreId && !!toStoreId && fromStoreId !== toStoreId;
  const linesComplete = rows.length > 0 && rows.every(isTransferLineRowComplete);
  const canSubmit = storesDiffer && linesComplete && !issueMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: IssueTransferDto = { fromStoreId, toStoreId, lines: transferLineRowsToDto(rows) };
    try {
      const transfer = await issueMutation.mutateAsync(dto);
      router.push(`/inventory/transfers/${transfer.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("headerTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label required>{t("fromStoreLabel")}</Label>
            <Select value={fromStoreId} onValueChange={setFromStoreId} disabled={storesQuery.isLoading}>
              <SelectTrigger>
                <SelectValue placeholder={storesQuery.isLoading ? t("loadingStores") : t("storePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {(storesQuery.data ?? []).map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("toStoreLabel")}</Label>
            <Select value={toStoreId} onValueChange={setToStoreId} disabled={storesQuery.isLoading}>
              <SelectTrigger>
                <SelectValue placeholder={storesQuery.isLoading ? t("loadingStores") : t("storePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {(storesQuery.data ?? []).map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {fromStoreId && toStoreId && !storesDiffer && <p className="text-xs text-destructive sm:col-span-2">{t("storesMustDiffer")}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("linesTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <TransferLineEditor rows={rows} onChange={setRows} />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.push("/inventory/transfers")}>
          {t("cancel")}
        </Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
          {issueMutation.isPending ? t("submitting") : t("submitButton")}
        </Button>
      </div>
    </div>
  );
}

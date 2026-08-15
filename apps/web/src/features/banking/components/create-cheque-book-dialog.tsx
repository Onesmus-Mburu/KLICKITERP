"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreateChequeBookDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useAccounts as useBankAccounts } from "@/features/banking/hooks/use-accounts";
import { useCreateChequeBook } from "../hooks/use-cheque-books";

/**
 * Phase 6 Slice 21 Part 5 (Banking, Module 16 — the LAST part of this slice)
 * — `POST /banking/cheque-books`. `accountId` reuses Part 1's own bank-account
 * picker (`features/banking/hooks/use-accounts.ts`, `isActive: true` —
 * deliberately NO `kind` filter, since `ChequeBooksService.create()` only
 * checks the account EXISTS, confirmed by reading it directly — a cheque book
 * against a `CASH`/`MPESA_SETTLEMENT`-kind account is just as valid as
 * `BANK`, the same "no kind restriction, server imposes none" precedent
 * `create-transfer-dialog.tsx` (Part 2) already established for its own
 * account pickers).
 *
 * `startLeaf`/`endLeaf` are plain integers (`min: 1` each), with a
 * client-side `endLeaf >= startLeaf` check mirroring
 * `ck_bank_cheque_book_leaf_range` — a UX nicety only; the real enforcement
 * is entirely server-side (`ChequeBooksService.create()`'s own
 * `ValidationException` if bypassed), surfaced verbatim via `ApiError.message`
 * either way. A live preview of the resulting leaf count
 * (`endLeaf - startLeaf + 1`) is shown so the user understands up front how
 * many `UNUSED` leaves this one create call will generate — no separate
 * "generate leaves" step exists (see `cheque-books.api.ts`'s own doc
 * comment).
 */
export function CreateChequeBookDialog() {
  const t = useTranslations("banking.chequeBooks.createDialog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [accountId, setAccountId] = React.useState("");
  const [prefix, setPrefix] = React.useState("");
  const [startLeaf, setStartLeaf] = React.useState("1");
  const [endLeaf, setEndLeaf] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateChequeBook();
  const accountsQuery = useBankAccounts({ isActive: true });

  const accountItems = React.useMemo(
    () => (accountsQuery.data ?? []).map((a) => ({ value: a.id, label: a.bankName ? `${a.name} — ${a.bankName}` : a.name })),
    [accountsQuery.data],
  );

  function resetForm() {
    setAccountId("");
    setPrefix("");
    setStartLeaf("1");
    setEndLeaf("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) resetForm();
  }

  const startLeafNum = Number(startLeaf);
  const endLeafNum = Number(endLeaf);
  const validRange = Number.isInteger(startLeafNum) && startLeafNum >= 1 && Number.isInteger(endLeafNum) && endLeafNum >= startLeafNum;
  const leafCount = validRange ? endLeafNum - startLeafNum + 1 : 0;
  const canSubmit = !!accountId && prefix.trim().length > 0 && validRange && !createMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: CreateChequeBookDto = { accountId, prefix: prefix.trim(), startLeaf: startLeafNum, endLeaf: endLeafNum };
    try {
      const created = await createMutation.mutateAsync(dto);
      setOpen(false);
      router.push(`/banking/cheque-books/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
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

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label required>{t("accountLabel")}</Label>
            <Combobox
              items={accountItems}
              value={accountId}
              onChange={setAccountId}
              placeholder={accountsQuery.isLoading ? t("loadingAccounts") : t("selectAccountPlaceholder")}
              searchPlaceholder={t("searchAccounts")}
              emptyText={t("noAccountsFound")}
              disabled={accountsQuery.isLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("prefixLabel")}</Label>
            <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder={t("prefixPlaceholder")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label required>{t("startLeafLabel")}</Label>
              <Input type="number" min={1} value={startLeaf} onChange={(e) => setStartLeaf(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("endLeafLabel")}</Label>
              <Input type="number" min={1} value={endLeaf} onChange={(e) => setEndLeaf(e.target.value)} />
            </div>
          </div>
          {endLeaf !== "" && !validRange && <p className="text-xs text-destructive">{t("invalidRangeError")}</p>}
          {validRange && <p className="text-xs text-muted-foreground">{t("leafCountHint", { count: leafCount })}</p>}
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

"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { BankChequeLeafResponseDto, IssueChequeLeafDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/patterns/money-input";
import { ApiError } from "@/lib/api-error";
import { useAccounts as useBankAccounts } from "@/features/banking/hooks/use-accounts";
import { useChequeBooks } from "../hooks/use-cheque-books";
import { useIssueChequeLeaf } from "../hooks/use-cheque-leaves";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Phase 6 Slice 21 Part 5 (Banking, Module 16 — the LAST part of this slice)
 * — `POST /banking/cheque-leaves/issue`. **BR-BANK-04 — the user picks a
 * BOOK, never a specific leaf.** The server always auto-picks the
 * lowest-numbered `UNUSED` leaf in the chosen book
 * (`ChequeLeavesService.issueNext()` -> `findNextUnused()`, confirmed by
 * reading both directly); there is no `leafId`/`leafNo` field anywhere on
 * `IssueChequeLeafDto`, and deliberately none is invented here. The resulting
 * leaf number is only known from the RESPONSE — shown in a dedicated result
 * step after a successful issue, the same "form step, then a real result
 * step" shape `run-due-button.tsx` (Expenses, Slice 20 Part 4) already
 * established for its own auto-picked-outcome action.
 *
 * A book with zero remaining `UNUSED` leaves is NOT filtered out of the
 * picker — this dialog has no cheap "remaining unused count" to check against
 * (`listChequeBooks()`'s own response never carries one, only the leaf
 * repository does, per-book, via a separate `GET .../cheque-leaves?bookId=`
 * call this dialog doesn't make for every book just to grey out a handful of
 * options) — the real, verbatim-surfaced `ValidationException` ("No UNUSED
 * leaves remain in cheque book …") is what tells the user, exactly the same
 * "don't pre-validate what the server already validates authoritatively"
 * discipline `column-mapping-form.tsx` (Part 3) and `create-adjustment-dialog.tsx`
 * (Part 4) both already established.
 *
 * **`voucherId` is optional and manually typed** — a real, already-existing
 * FK to `proc_payment_voucher` (the Part 1/Part 5 retrofit's own reverse
 * direction: THAT dialog picks a leaf FROM a voucher; THIS one can
 * optionally link a leaf TO an already-created voucher at issue time). No
 * cross-feature Procurement voucher picker is built here — the same
 * per-feature-boundary discipline `statement-import.api.ts` (Part 3) already
 * established ("no feature folder in this codebase imports another feature's
 * `api/`/`hooks/` files") — so this stays an honest, validated-as-UUID free
 * text field, the same shape `create-adjustment-dialog.tsx`'s own
 * `statementLineId` (Part 4) already established for an analogous
 * not-otherwise-discoverable-id case, just optional here rather than
 * required.
 */
export function IssueChequeLeafDialog() {
  const t = useTranslations("banking.chequeLeaves.issueDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [bookId, setBookId] = React.useState("");
  const [voucherId, setVoucherId] = React.useState("");
  const [payee, setPayee] = React.useState("");
  const [amount, setAmount] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [issued, setIssued] = React.useState<BankChequeLeafResponseDto | null>(null);

  const issueMutation = useIssueChequeLeaf();
  const booksQuery = useChequeBooks();
  const accountsQuery = useBankAccounts();

  const accountNameById = React.useMemo(() => new Map((accountsQuery.data ?? []).map((a) => [a.id, a.name])), [accountsQuery.data]);
  const bookItems = React.useMemo(
    () =>
      (booksQuery.data ?? []).map((b) => ({
        value: b.id,
        label: `${b.prefix} (${b.startLeaf}–${b.endLeaf}) — ${accountNameById.get(b.accountId) ?? b.accountId}`,
      })),
    [booksQuery.data, accountNameById],
  );

  function resetForm() {
    setBookId("");
    setVoucherId("");
    setPayee("");
    setAmount(null);
    setError(null);
    setIssued(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) resetForm();
  }

  const voucherIdValid = voucherId.trim().length === 0 || UUID_PATTERN.test(voucherId.trim());
  const canSubmit = !!bookId && payee.trim().length > 0 && !!amount && voucherIdValid && !issueMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit || !amount) return;
    setError(null);
    const dto: IssueChequeLeafDto = {
      bookId,
      payee: payee.trim(),
      amount,
      ...(voucherId.trim() ? { voucherId: voucherId.trim() } : {}),
    };
    try {
      const result = await issueMutation.mutateAsync(dto);
      setIssued(result);
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

        {issued === null ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label required>{t("bookLabel")}</Label>
              <Combobox
                items={bookItems}
                value={bookId}
                onChange={setBookId}
                placeholder={booksQuery.isLoading ? t("loadingBooks") : t("selectBookPlaceholder")}
                searchPlaceholder={t("searchBooks")}
                emptyText={t("noBooksFound")}
                disabled={booksQuery.isLoading}
              />
              <p className="text-xs text-muted-foreground">{t("bookHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label required>{t("payeeLabel")}</Label>
              <Input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder={t("payeePlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("amountLabel")}</Label>
              <MoneyInput value={amount ?? ""} onValueChange={setAmount} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("voucherIdLabel")}</Label>
              <Input value={voucherId} onChange={(e) => setVoucherId(e.target.value)} placeholder={t("voucherIdPlaceholder")} />
              {voucherId.trim().length > 0 && !voucherIdValid && <p className="text-xs text-destructive">{t("voucherIdInvalid")}</p>}
              <p className="text-xs text-muted-foreground">{t("voucherIdHint")}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Alert variant="success">
              <AlertDescription>{t("issuedSummary", { leafNo: issued.leafNo })}</AlertDescription>
            </Alert>
            <div className="rounded-md border border-border p-3 text-sm">
              <p>
                <span className="text-muted-foreground">{t("resultPayeeLabel")}: </span>
                {issued.payee}
              </p>
              <p>
                <span className="text-muted-foreground">{t("resultAmountLabel")}: </span>
                {issued.amount}
              </p>
              {issued.voucherId && (
                <p>
                  <Link href={`/procurement/payment-vouchers/${issued.voucherId}`} className="text-primary hover:underline">
                    {t("viewLinkedVoucher")}
                  </Link>
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {issued === null ? (
            <>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
                {issueMutation.isPending ? t("issuing") : t("issueButton")}
              </Button>
            </>
          ) : (
            <Button type="button" onClick={() => setOpen(false)}>
              {tCommon("close")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

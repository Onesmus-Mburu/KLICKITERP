"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { FaDisposalResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney, isValidDecimalString, sumMoneyStrings } from "@/lib/money";
import { useAccounts } from "@/features/accounting/hooks/use-accounts";
import { useJournal } from "@/features/accounting/hooks/use-journals";
import { useAsset } from "../hooks/use-assets";
import { useCategory } from "../hooks/use-categories";

/** The 2 hardcoded-by-code accounts P-31 posts against that AREN'T on `fa_category` — see `gl-disposal-accounts.util.ts` (`packages/server`) directly, not guessed. `4050`/`5110` are mutually exclusive (never both on one journal); `1020` is skipped whenever `proceeds=0`. */
const DISPOSAL_PROCEEDS_ACCOUNT_CODE = "1020";
const GAIN_ON_DISPOSAL_ACCOUNT_CODE = "4050";
const LOSS_ON_DISPOSAL_ACCOUNT_CODE = "5110";

/** `lib/money.ts` has no subtraction helper — see `create-disposal-dialog.tsx`'s own identical local helper's own doc comment for why this 1-caller-each duplication is preferred over extending the shared lib. */
function negateDecimalString(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("-")) return trimmed.slice(1);
  if (/^0(\.0+)?$/.test(trimmed)) return trimmed;
  return `-${trimmed}`;
}

function isZeroDecimal(value: string): boolean {
  return isValidDecimalString(value) && /^-?0(\.0+)?$/.test(value.trim());
}
function isNegativeDecimal(value: string): boolean {
  return isValidDecimalString(value) && value.trim().startsWith("-") && !isZeroDecimal(value);
}
function isPositiveDecimal(value: string): boolean {
  return isValidDecimalString(value) && !isZeroDecimal(value) && !isNegativeDecimal(value);
}

interface PreviewLine {
  key: string;
  label: string;
  debit: string;
  credit: string;
}

/**
 * Phase 6 Slice 23 Part 4 (Fixed Assets, Module 17) — the real P-31
 * 4-line-or-fewer breakdown, per this part's own task brief: "show this real
 * 4-line breakdown plainly ... since it's genuinely instructive."
 *
 * **Two genuinely different data sources, chosen by whether this disposal
 * has actually posted yet — never conflated.**
 *
 * 1. **`disposal.journalId` set (POSTED)** — renders the REAL posted journal
 *    lines, fetched via Accounting's own `useJournal()` (the only journals
 *    query that returns populated `lines`, per that hook's own doc comment)
 *    and resolved to human `code — name` labels via `useAccounts()`'s full
 *    list (an id→account map, the same `depreciation-run-lines-table.tsx`
 *    map-building precedent, cheaper than one `useAccount()` call per line
 *    for a variable up to 4 lines). This is REAL data, not a recomputation —
 *    the authoritative source of truth once it exists.
 *
 * 2. **Not yet posted** — a client-computed PREVIEW using the exact same
 *    formula `post()` itself runs (`disposal.service.ts:173-261`), clearly
 *    labeled as a preview (`previewTitle`/`livePreviewNote`), never
 *    presented as already-real data.
 *
 * **A real, honest architectural note surfaced in `livePreviewNote` — found
 * by reading `post()` directly, not guessed:** `disposal.gainLoss` is
 * FROZEN at creation time using the asset's `accumDepreciation` AT THAT
 * MOMENT (`create()`, `disposal.service.ts:56-84`), but `post()` re-reads
 * the asset's CURRENT `accumDepreciation` for the accum-dep journal line
 * specifically (`disposal.service.ts:199-208`) — these are the SAME value
 * only if no depreciation run posts for this asset between this disposal's
 * creation and its posting. If one does, the frozen `gainLoss` and the
 * live accum-dep line diverge, and by the algebra `post()`'s own doc
 * comment states (`gain_loss` DEFINED as `proceeds - (cost -
 * accum_depreciation_AT_CREATION)`), the resulting journal's own debit/
 * credit totals would differ by exactly that divergence — a genuine
 * TOCTOU-shaped gap, not something this preview can paper over client-side
 * (it doesn't know the future). Not something this part's own scoped-out
 * backend-touch budget fixes (no backend bug was going looked for, and this
 * one wasn't confirmed live — no depreciation run was run mid-lifecycle
 * during this part's own live verification) — flagged here plainly, the
 * same "read the real code, don't guess" discipline this codebase already
 * applies everywhere else.
 */
export function DisposalJournalPreview({ disposal }: { disposal: FaDisposalResponseDto }) {
  const t = useTranslations("fixedAssets.disposals.journalPreview");
  const assetQuery = useAsset(disposal.assetId);
  const categoryQuery = useCategory(assetQuery.data?.categoryId);
  const accountsQuery = useAccounts();
  const journalQuery = useJournal(disposal.journalId ?? undefined);

  const accountByCode = React.useMemo(() => new Map((accountsQuery.data ?? []).map((a) => [a.code, a])), [accountsQuery.data]);
  const accountById = React.useMemo(() => new Map((accountsQuery.data ?? []).map((a) => [a.id, a])), [accountsQuery.data]);

  function labelForCode(code: string, fallback: string): string {
    const acct = accountByCode.get(code);
    return acct ? `${acct.code} — ${acct.name}` : fallback;
  }
  function labelForId(id: string): string {
    const acct = accountById.get(id);
    return acct ? `${acct.code} — ${acct.name}` : id;
  }

  if (disposal.journalId) {
    const lines = journalQuery.data?.lines ?? [];
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("postedTitle")}</CardTitle>
          <CardDescription>{t("postedDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {journalQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("loadingJournal")}</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columns.account")}</TableHead>
                    <TableHead>{t("columns.memo")}</TableHead>
                    <TableHead>{t("columns.debit")}</TableHead>
                    <TableHead>{t("columns.credit")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{labelForId(line.accountId)}</TableCell>
                      <TableCell className="text-muted-foreground">{line.memo ?? "—"}</TableCell>
                      <TableCell>{isPositiveDecimal(line.debit) ? formatMoney(line.debit) : "—"}</TableCell>
                      <TableCell>{isPositiveDecimal(line.credit) ? formatMoney(line.credit) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const asset = assetQuery.data;
  const category = categoryQuery.data;
  if (!asset || !category) return null;

  const gainLoss = disposal.gainLoss ?? "0";
  const lines: PreviewLine[] = [];

  if (isPositiveDecimal(disposal.proceeds)) {
    lines.push({ key: "proceeds", label: labelForCode(DISPOSAL_PROCEEDS_ACCOUNT_CODE, t("proceedsAccountFallback")), debit: disposal.proceeds, credit: "0" });
  }
  if (isPositiveDecimal(asset.accumDepreciation)) {
    lines.push({ key: "accumDep", label: labelForId(category.glAccumDepAccountId), debit: asset.accumDepreciation, credit: "0" });
  }
  if (isNegativeDecimal(gainLoss)) {
    lines.push({ key: "loss", label: labelForCode(LOSS_ON_DISPOSAL_ACCOUNT_CODE, t("lossAccountFallback")), debit: negateDecimalString(gainLoss), credit: "0" });
  } else if (isPositiveDecimal(gainLoss)) {
    lines.push({ key: "gain", label: labelForCode(GAIN_ON_DISPOSAL_ACCOUNT_CODE, t("gainAccountFallback")), debit: "0", credit: gainLoss });
  }
  lines.push({ key: "cost", label: labelForId(category.glCostAccountId), debit: "0", credit: asset.cost });

  const totalDebit = sumMoneyStrings(lines.map((l) => l.debit));
  const totalCredit = sumMoneyStrings(lines.map((l) => l.credit));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">{t("previewTitle")}</CardTitle>
        <CardDescription>{t("previewDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="warning">
          <AlertDescription>{t("livePreviewNote")}</AlertDescription>
        </Alert>
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.account")}</TableHead>
                <TableHead>{t("columns.debit")}</TableHead>
                <TableHead>{t("columns.credit")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.key}>
                  <TableCell>{line.label}</TableCell>
                  <TableCell>{isPositiveDecimal(line.debit) ? formatMoney(line.debit) : "—"}</TableCell>
                  <TableCell>{isPositiveDecimal(line.credit) ? formatMoney(line.credit) : "—"}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell>{t("totalsRowLabel")}</TableCell>
                <TableCell>{formatMoney(totalDebit)}</TableCell>
                <TableCell>{formatMoney(totalCredit)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

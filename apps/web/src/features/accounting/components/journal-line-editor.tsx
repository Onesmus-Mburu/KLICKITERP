"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyInput } from "@/components/patterns/money-input";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useAccounts } from "../hooks/use-accounts";
import { useCostCenters } from "../hooks/use-cost-centers";
import { emptyJournalLineRow, journalLinesTotals, updateJournalLineRow, type JournalLineFormRow } from "../lib/journal-lines";

const MEMO_MAX_LENGTH = 200; // gl_journal_line.memo — journal-line-input.dto.ts's own @MaxLength(200).

/**
 * Phase 6 Slice 17 Part 2 (Journals, Module 7) — the repeatable debit/credit
 * line-row editor backing the manual journal entry form. Per the plan:
 * "entering a debit clears/disables credit for that row and vice versa" —
 * `updateJournalLineRow()` (`../lib/journal-lines.ts`) enforces the clearing
 * half; this component additionally DISABLES whichever input isn't the
 * active one for a row that already has a real value on the other side, so
 * the illegal "both debit and credit filled" state can't even be typed into
 * transiently.
 *
 * **Account picker**: `useAccounts()` (Part 1's own hook, no server-side
 * `isPostable` filter param exists — confirmed in that hook's own doc
 * comment) fetches the full flat list and this component filters
 * client-side to `isPostable && isActive`, per the plan's explicit
 * instruction — a header/control-summary or inactive account can never
 * receive a posting (`PostingService`'s own account-postability guard), so
 * offering them here would just produce a guaranteed 422 on submit.
 *
 * **Cost center picker**: optional per line (`JournalLineInputDto.costCenterId?`)
 * — `useCostCenters(true)` (Part 1's own `activeOnly` param) plus an
 * explicit "None" row, the same `NONE_SENTINEL` pattern
 * `create-account-dialog.tsx` already established for `<Select>`'s "nothing
 * selected" case (`<Combobox>` doesn't need the sentinel — its own `value`
 * prop already accepts `""` as "nothing selected" natively, unlike
 * `<Select.Item>`).
 */
export function JournalLineEditor({ rows, onChange }: { rows: JournalLineFormRow[]; onChange: (rows: JournalLineFormRow[]) => void }) {
  const t = useTranslations("accounting.journals.lineEditor");
  const accountsQuery = useAccounts({ isActive: true });
  const costCentersQuery = useCostCenters(true);

  const accountItems = React.useMemo(
    () =>
      (accountsQuery.data ?? [])
        .filter((a) => a.isPostable && a.isActive)
        .map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
    [accountsQuery.data],
  );
  const costCenterItems = React.useMemo(
    () => (costCentersQuery.data ?? []).map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
    [costCentersQuery.data],
  );

  const totals = journalLinesTotals(rows);

  function patchRow(key: string, patch: Partial<JournalLineFormRow>) {
    onChange(updateJournalLineRow(rows, key, patch));
  }

  function addRow() {
    onChange([...rows, emptyJournalLineRow()]);
  }

  function removeRow(key: string) {
    onChange(rows.filter((r) => r.key !== key));
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("account")}</TableHead>
              <TableHead>{t("costCenter")}</TableHead>
              <TableHead>{t("debit")}</TableHead>
              <TableHead>{t("credit")}</TableHead>
              <TableHead>{t("memo")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const debitDisabled = row.credit.trim() !== "" && !/^-?0+(\.0+)?$/.test(row.credit.trim());
              const creditDisabled = row.debit.trim() !== "" && !/^-?0+(\.0+)?$/.test(row.debit.trim());
              return (
                <TableRow key={row.key}>
                  <TableCell className="min-w-[220px]">
                    <Combobox
                      items={accountItems}
                      value={row.accountId}
                      onChange={(v) => patchRow(row.key, { accountId: v })}
                      placeholder={accountsQuery.isLoading ? t("loadingAccounts") : t("selectAccount")}
                      searchPlaceholder={t("searchAccounts")}
                      emptyText={t("noAccountsFound")}
                      disabled={accountsQuery.isLoading}
                    />
                  </TableCell>
                  <TableCell className="min-w-[180px]">
                    <Combobox
                      items={costCenterItems}
                      value={row.costCenterId}
                      onChange={(v) => patchRow(row.key, { costCenterId: v })}
                      placeholder={t("noCostCenter")}
                      searchPlaceholder={t("searchCostCenters")}
                      emptyText={t("noCostCentersFound")}
                    />
                  </TableCell>
                  <TableCell className="min-w-[140px]">
                    <MoneyInput
                      value={row.debit}
                      onValueChange={(v) => patchRow(row.key, { debit: v ?? "" })}
                      currency={DEFAULT_CURRENCY}
                      disabled={debitDisabled}
                    />
                  </TableCell>
                  <TableCell className="min-w-[140px]">
                    <MoneyInput
                      value={row.credit}
                      onValueChange={(v) => patchRow(row.key, { credit: v ?? "" })}
                      currency={DEFAULT_CURRENCY}
                      disabled={creditDisabled}
                    />
                  </TableCell>
                  <TableCell className="min-w-[160px]">
                    <Input value={row.memo} maxLength={MEMO_MAX_LENGTH} onChange={(e) => patchRow(row.key, { memo: e.target.value })} placeholder={t("memoPlaceholder")} />
                  </TableCell>
                  <TableCell>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(row.key)} disabled={rows.length <= 2} aria-label={t("removeLine")}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="size-4" />
        {t("addLine")}
      </Button>

      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm",
          totals.balanced ? "border-success/30 bg-tint-success" : "border-warning/30 bg-tint-warning",
        )}
      >
        <div className="flex flex-wrap gap-6">
          <span>
            <span className="text-muted-foreground">{t("totalDebits")}: </span>
            <span className="font-medium text-foreground">{formatMoney(totals.totalDebit)}</span>
          </span>
          <span>
            <span className="text-muted-foreground">{t("totalCredits")}: </span>
            <span className="font-medium text-foreground">{formatMoney(totals.totalCredit)}</span>
          </span>
          <span>
            <span className="text-muted-foreground">{t("difference")}: </span>
            <span className="font-medium text-foreground">{formatMoney(totals.difference)}</span>
          </span>
        </div>
        <span className={cn("font-medium", totals.balanced ? "text-success" : "text-warning")}>
          {totals.balanced ? t("balanced") : t("unbalanced")}
        </span>
      </div>
    </div>
  );
}

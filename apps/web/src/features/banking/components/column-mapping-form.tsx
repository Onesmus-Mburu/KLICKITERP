"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DebitCreditConvention, StatementMappingTemplate } from "../hooks/use-statement-import";

const NONE_SENTINEL = "__none__"; // `<Select>` can't represent "nothing selected" as `value=""` when a real empty-string item also needs to render as an actual choice — same pattern `banking/transfers/page.tsx`'s own `ALL_SENTINEL` already establishes, here for the OPTIONAL `ref` column.
const DATE_FORMAT_MAX_LENGTH = 20; // No DB column backs this directly (it lives inside the `mappingTemplate` JSONB blob), but a runaway-length token template is never legitimate — a generous cap, not a real constraint mirror.

/**
 * Phase 6 Slice 21 Part 3 (Statement Import, Module 16) — maps this wizard's
 * already-parsed CSV headers (`lib/csv-parser.ts`) onto
 * `BankStatementMappingTemplateDto`'s own real fields. Every dropdown here is
 * populated from the REAL header row of the file the user just uploaded —
 * never a guessed/hardcoded column-name list — so a mapping built through
 * this form can only ever reference a column that genuinely exists in the
 * file.
 *
 * **`debitCreditConvention` toggles which amount field(s) are shown**,
 * mirroring `BankStatementImportService.parseAmounts()`'s own real
 * requirement (confirmed by reading it directly): `SEPARATE_COLUMNS` needs
 * BOTH `columnMap.debit` AND `columnMap.credit` set (a real
 * `ValidationException` — surfaced verbatim as a 422 — if either is missing),
 * `SIGNED_AMOUNT` needs `columnMap.amount` alone (positive = money in/debit,
 * negative = money out/credit — the same convention
 * `ReconciliationService`'s own matching engine relies on). Switching
 * convention clears whichever fields no longer apply, the same
 * "switching clears the other shape's own field state" discipline
 * `create-payment-voucher-dialog.tsx` (Procurement, Slice 21 Part 1 retrofit)
 * already established for its own `method` switch.
 *
 * **`dateFormat` is a token template, not a free-form date string** — a
 * combination of `YYYY`/`MM`/`DD` separated by any non-digit character(s)
 * (`BankStatementMappingTemplate.dateFormat`'s own doc comment,
 * `bank-statement-import.service.ts`), e.g. `"YYYY-MM-DD"` or `"DD/MM/YYYY"`.
 * This form pre-validates the SAME token pattern the server's own
 * `parseStatementDate()` checks (`/YYYY|MM|DD/g`, confirmed by reading it
 * directly) as an early UX nicety — the real enforcement stays entirely
 * server-side, a genuine mismatch still surfaces as a real 422 verbatim via
 * `ApiError.message` at import time, this form doesn't attempt to replicate
 * the server's own row-by-row date parsing to predict that ahead of time.
 */
export function ColumnMappingForm({
  headers,
  value,
  onChange,
}: {
  headers: string[];
  value: StatementMappingTemplate;
  onChange: (next: StatementMappingTemplate) => void;
}) {
  const t = useTranslations("banking.statementImports.new.mapping");

  function setColumnMap(patch: Partial<StatementMappingTemplate["columnMap"]>) {
    onChange({ ...value, columnMap: { ...value.columnMap, ...patch } });
  }

  function setConvention(next: DebitCreditConvention) {
    onChange({
      ...value,
      debitCreditConvention: next,
      columnMap:
        next === "SEPARATE_COLUMNS"
          ? { ...value.columnMap, amount: undefined }
          : { ...value.columnMap, debit: undefined, credit: undefined },
    });
  }

  const headerItems = headers.map((h) => ({ value: h, label: h }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label required>{t("dateColumnLabel")}</Label>
          <HeaderSelect
            value={value.columnMap.date}
            onChange={(v) => setColumnMap({ date: v })}
            headerItems={headerItems}
            placeholder={t("selectColumnPlaceholder")}
          />
        </div>
        <div className="space-y-1.5">
          <Label required>{t("descriptionColumnLabel")}</Label>
          <HeaderSelect
            value={value.columnMap.description}
            onChange={(v) => setColumnMap({ description: v })}
            headerItems={headerItems}
            placeholder={t("selectColumnPlaceholder")}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label required>{t("conventionLabel")}</Label>
        <Select value={value.debitCreditConvention} onValueChange={(v) => setConvention(v as DebitCreditConvention)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="SEPARATE_COLUMNS">{t("conventionSeparate")}</SelectItem>
            <SelectItem value="SIGNED_AMOUNT">{t("conventionSigned")}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {value.debitCreditConvention === "SEPARATE_COLUMNS" ? t("conventionSeparateHint") : t("conventionSignedHint")}
        </p>
      </div>

      {value.debitCreditConvention === "SEPARATE_COLUMNS" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label required>{t("debitColumnLabel")}</Label>
            <HeaderSelect
              value={value.columnMap.debit ?? ""}
              onChange={(v) => setColumnMap({ debit: v })}
              headerItems={headerItems}
              placeholder={t("selectColumnPlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("creditColumnLabel")}</Label>
            <HeaderSelect
              value={value.columnMap.credit ?? ""}
              onChange={(v) => setColumnMap({ credit: v })}
              headerItems={headerItems}
              placeholder={t("selectColumnPlaceholder")}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label required>{t("amountColumnLabel")}</Label>
          <HeaderSelect
            value={value.columnMap.amount ?? ""}
            onChange={(v) => setColumnMap({ amount: v })}
            headerItems={headerItems}
            placeholder={t("selectColumnPlaceholder")}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label>{t("refColumnLabel")}</Label>
        <Select
          value={value.columnMap.ref ?? NONE_SENTINEL}
          onValueChange={(v) => setColumnMap({ ref: v === NONE_SENTINEL ? undefined : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("selectColumnPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_SENTINEL}>{t("refColumnNone")}</SelectItem>
            {headerItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t("refColumnHint")}</p>
      </div>

      <div className="space-y-1.5">
        <Label required>{t("dateFormatLabel")}</Label>
        <Input
          value={value.dateFormat}
          maxLength={DATE_FORMAT_MAX_LENGTH}
          onChange={(e) => onChange({ ...value, dateFormat: e.target.value })}
          placeholder={t("dateFormatPlaceholder")}
        />
        <p className="text-xs text-muted-foreground">{t("dateFormatHint")}</p>
      </div>
    </div>
  );
}

/** Small local helper — every column dropdown in this form shares the exact same "list of real file headers, required" shape, only the selected value/setter differ. */
function HeaderSelect({
  value,
  onChange,
  headerItems,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  headerItems: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {headerItems.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A fresh, empty mapping template — the wizard's own starting point (never pre-filled with a guessed column) unless the user explicitly picks "prefill from last import." */
export function emptyMappingTemplate(): StatementMappingTemplate {
  return {
    columnMap: { date: "", description: "" },
    dateFormat: "YYYY-MM-DD",
    debitCreditConvention: "SEPARATE_COLUMNS",
  };
}

/** Mirrors `BankStatementImportService.parseAmounts()`'s own real requirement — see this file's own doc comment above. Also checked here: `dateFormat` must contain at least one YYYY/MM/DD token, the same pattern `parseStatementDate()` requires server-side. */
export function isMappingComplete(mapping: StatementMappingTemplate): boolean {
  if (!mapping.columnMap.date.trim() || !mapping.columnMap.description.trim()) return false;
  if (!mapping.dateFormat.trim() || !/YYYY|MM|DD/.test(mapping.dateFormat)) return false;
  if (mapping.debitCreditConvention === "SEPARATE_COLUMNS") {
    return !!mapping.columnMap.debit && !!mapping.columnMap.credit;
  }
  return !!mapping.columnMap.amount;
}

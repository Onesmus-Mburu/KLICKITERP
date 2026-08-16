"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  asAhlParams,
  asNssfParams,
  asPayeParams,
  asShifParams,
  defaultParamsForKind,
  type AhlParams,
  type NssfParams,
  type PayeBand,
  type PayeParams,
  type PyrlStatutoryKind,
  type ShifParams,
} from "../lib/statutory-params";

type Translate = ReturnType<typeof useTranslations>;

/**
 * Phase 6 Slice 22 Part 4 (Payroll, Module 15) — the 4 kind-specific
 * `pyrl_statutory_table.params` sub-forms (PAYE bands, NSSF tier1/tier2,
 * SHIF rate/minimumAmount, AHL employeeRate/employerRate), shared between
 * `create-statutory-table-dialog.tsx` (fresh `params`, defaulted via
 * `defaultParamsForKind()`) and `edit-statutory-table-dialog.tsx` (the row's
 * own already-fixed `kind`, real existing `params`) — built as ONE reusable
 * component rather than duplicated per-dialog, matching this feature's own
 * established `component-combobox.tsx`/`percent.ts` precedent of factoring
 * out logic 2+ call sites would otherwise duplicate.
 *
 * **Deliberately 4 separate, structurally distinct sub-forms, not one
 * generic "params editor"** — per this part's own task brief: PAYE's
 * repeatable band-row list, NSSF's exactly-2-fixed-tiers, SHIF's
 * rate+optional-floor, and AHL's 2 fixed rates are genuinely different
 * shapes, not variations of one schema.
 *
 * **Every rate field is a plain `<input type="number">` showing/editing the
 * REAL stored fraction directly** (e.g. `0.06` for NSSF's 6%), with an
 * inline hint translated per-field — see `lib/statutory-params.ts`'s own
 * doc comment for why this deliberately does NOT reuse `lib/percent.ts`'s
 * decimal-string percent<->fraction conversion (a different field, a
 * different underlying type, on a different table).
 *
 * `value`/`onChange` work over the wire-shaped `Record<string, unknown>`
 * `params` object directly (the real DTO field type) — each sub-form parses
 * its own expected shape via the `as*Params()` guards, falling back to
 * `defaultParamsForKind()` if the real stored `params` doesn't match its own
 * `kind`'s documented shape (opaque jsonb server-side, no nested-shape
 * validation at the DTO level — a real row COULD be malformed).
 */
export function StatutoryParamsForm({
  kind,
  params,
  onChange,
}: {
  kind: PyrlStatutoryKind;
  params: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const t = useTranslations("payroll.statutoryTables.paramsForm");

  switch (kind) {
    case "PAYE": {
      const value = asPayeParams(params) ?? (defaultParamsForKind("PAYE") as unknown as PayeParams);
      return <PayeParamsFields value={value} onChange={(next) => onChange(next as unknown as Record<string, unknown>)} t={t} />;
    }
    case "NSSF": {
      const value = asNssfParams(params) ?? (defaultParamsForKind("NSSF") as unknown as NssfParams);
      return <NssfParamsFields value={value} onChange={(next) => onChange(next as unknown as Record<string, unknown>)} t={t} />;
    }
    case "SHIF": {
      const value = asShifParams(params) ?? (defaultParamsForKind("SHIF") as unknown as ShifParams);
      return <ShifParamsFields value={value} onChange={(next) => onChange(next as unknown as Record<string, unknown>)} t={t} />;
    }
    case "AHL": {
      const value = asAhlParams(params) ?? (defaultParamsForKind("AHL") as unknown as AhlParams);
      return <AhlParamsFields value={value} onChange={(next) => onChange(next as unknown as Record<string, unknown>)} t={t} />;
    }
  }
}

function PayeParamsFields({ value, onChange, t }: { value: PayeParams; onChange: (next: PayeParams) => void; t: Translate }) {
  function updateBand(index: number, patch: Partial<PayeBand>) {
    onChange({ ...value, bands: value.bands.map((b, i) => (i === index ? { ...b, ...patch } : b)) });
  }
  function addBand() {
    onChange({ ...value, bands: [...value.bands, { min: 0, max: null, rate: 0 }] });
  }
  function removeBand(index: number) {
    onChange({ ...value, bands: value.bands.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("bandsLabel")}</Label>
        <p className="text-xs text-muted-foreground">{t("bandsHint")}</p>
        <div className="space-y-2">
          {value.bands.map((band, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2 rounded-lg border border-border p-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("bandMinLabel")}</Label>
                <Input type="number" value={band.min} onChange={(e) => updateBand(i, { min: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("bandMaxLabel")}</Label>
                <Input
                  type="number"
                  value={band.max ?? ""}
                  placeholder={t("bandMaxUnlimitedPlaceholder")}
                  onChange={(e) => updateBand(i, { max: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("bandRateLabel")}</Label>
                <Input type="number" step="any" value={band.rate} onChange={(e) => updateBand(i, { rate: Number(e.target.value) })} />
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeBand(i)} disabled={value.bands.length <= 1}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addBand}>
          <Plus className="size-4" />
          {t("addBandButton")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("bandMaxUnlimitedHint")}</p>
        <p className="text-xs text-muted-foreground">{t("rateFractionHint")}</p>
      </div>
      <div className="space-y-1.5">
        <Label required>{t("personalReliefLabel")}</Label>
        <Input
          type="number"
          value={value.personalReliefMonthly}
          onChange={(e) => onChange({ ...value, personalReliefMonthly: Number(e.target.value) })}
        />
      </div>
    </div>
  );
}

function NssfParamsFields({ value, onChange, t }: { value: NssfParams; onChange: (next: NssfParams) => void; t: Translate }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border border-border p-3">
        <Label>{t("tier1Label")}</Label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label required className="text-xs">
              {t("tier1UpperLimitLabel")}
            </Label>
            <Input
              type="number"
              value={value.tier1.upperLimit}
              onChange={(e) => onChange({ ...value, tier1: { ...value.tier1, upperLimit: Number(e.target.value) } })}
            />
          </div>
          <div className="space-y-1.5">
            <Label required className="text-xs">
              {t("rateLabel")}
            </Label>
            <Input
              type="number"
              step="any"
              value={value.tier1.rate}
              onChange={(e) => onChange({ ...value, tier1: { ...value.tier1, rate: Number(e.target.value) } })}
            />
          </div>
        </div>
      </div>
      <div className="space-y-2 rounded-lg border border-border p-3">
        <Label>{t("tier2Label")}</Label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label required className="text-xs">
              {t("tier2LowerLimitLabel")}
            </Label>
            <Input
              type="number"
              value={value.tier2.lowerLimit}
              onChange={(e) => onChange({ ...value, tier2: { ...value.tier2, lowerLimit: Number(e.target.value) } })}
            />
          </div>
          <div className="space-y-1.5">
            <Label required className="text-xs">
              {t("tier2UpperLimitLabel")}
            </Label>
            <Input
              type="number"
              value={value.tier2.upperLimit}
              onChange={(e) => onChange({ ...value, tier2: { ...value.tier2, upperLimit: Number(e.target.value) } })}
            />
          </div>
          <div className="space-y-1.5">
            <Label required className="text-xs">
              {t("rateLabel")}
            </Label>
            <Input
              type="number"
              step="any"
              value={value.tier2.rate}
              onChange={(e) => onChange({ ...value, tier2: { ...value.tier2, rate: Number(e.target.value) } })}
            />
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("rateFractionHint")}</p>
    </div>
  );
}

function ShifParamsFields({ value, onChange, t }: { value: ShifParams; onChange: (next: ShifParams) => void; t: Translate }) {
  const hasMinimum = value.minimumAmount !== undefined;
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label required>{t("rateLabel")}</Label>
        <Input type="number" step="any" value={value.rate} onChange={(e) => onChange({ ...value, rate: Number(e.target.value) })} />
        <p className="text-xs text-muted-foreground">{t("rateFractionHint")}</p>
      </div>
      <div className="space-y-1.5">
        <Label>{t("minimumAmountLabel")}</Label>
        <Input
          type="number"
          value={hasMinimum ? value.minimumAmount : ""}
          placeholder={t("minimumAmountPlaceholder")}
          onChange={(e) => {
            if (e.target.value === "") {
              const { minimumAmount: _drop, ...rest } = value;
              onChange(rest);
              return;
            }
            onChange({ ...value, minimumAmount: Number(e.target.value) });
          }}
        />
        <p className="text-xs text-muted-foreground">{t("minimumAmountHint")}</p>
      </div>
    </div>
  );
}

function AhlParamsFields({ value, onChange, t }: { value: AhlParams; onChange: (next: AhlParams) => void; t: Translate }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label required>{t("employeeRateLabel")}</Label>
          <Input type="number" step="any" value={value.employeeRate} onChange={(e) => onChange({ ...value, employeeRate: Number(e.target.value) })} />
        </div>
        <div className="space-y-1.5">
          <Label required>{t("employerRateLabel")}</Label>
          <Input type="number" step="any" value={value.employerRate} onChange={(e) => onChange({ ...value, employerRate: Number(e.target.value) })} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("rateFractionHint")}</p>
    </div>
  );
}

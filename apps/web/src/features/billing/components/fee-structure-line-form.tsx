"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { MoneyInput } from "@/components/patterns/money-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { useFeeCategories } from "../hooks/use-fee-categories";
import { useAddFeeStructureLine } from "../hooks/use-fee-structures";
import { useTerms } from "../hooks/use-academic-calendar";

/**
 * Add-a-line inline form for a DRAFT fee structure — `feeCategoryId` + TERM +
 * DUE DATE + `<MoneyInput>` amount + optional-flag, per the plan. Phase 6
 * Slice 3b (Fee Structure Redesign): the structure itself is now
 * year-scoped, so each line must name its own term (scoped to the
 * structure's `academicYearId` via `useTerms()` — reusing Slice 3's own
 * academic-calendar hooks, per the plan) and due date; the server rejects a
 * term whose academic year doesn't match the structure's own
 * (`FeeStructuresService.addLine()`'s `requireTermInStructureYear` check),
 * so this form only offers terms that are already scoped to the right year
 * by construction — that mismatch case can't be produced from this UI.
 * Rendered inline (not a `<Dialog>`) since it sits directly under an
 * already-open lines table on the fee structure detail page, matching the
 * density of a repeated add-line action rather than a modal per line.
 *
 * Phase 6 Slice 3b follow-up: the category field now uses the generic
 * `<Combobox>` primitive (`components/ui/combobox.tsx`) instead of a plain
 * `<Select>` — real schools can have long fee-category lists, and Radix's
 * `Select` only offers single-key-jump typeahead, not real substring
 * filtering. `<Combobox>` still supports plain scrolling/browsing the full
 * list (clear the search box), it just adds real search on top.
 */
export function FeeStructureLineForm({ structureId, academicYearId }: { structureId: string; academicYearId: string }) {
  const t = useTranslations("billing.feeStructures.lineForm");
  const categoriesQuery = useFeeCategories();
  const termsQuery = useTerms(academicYearId);
  const addLineMutation = useAddFeeStructureLine(structureId);

  const [feeCategoryId, setFeeCategoryId] = React.useState("");
  const [termId, setTermId] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [isOptional, setIsOptional] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const categoryItems = React.useMemo(
    () => (categoriesQuery.data ?? []).filter((c) => c.isActive).map((category) => ({ value: category.id, label: category.name })),
    [categoriesQuery.data],
  );

  async function handleAdd() {
    setError(null);
    if (!feeCategoryId) {
      setError(t("categoryRequired"));
      return;
    }
    if (!termId) {
      setError(t("termRequired"));
      return;
    }
    if (!dueDate) {
      setError(t("dueDateRequired"));
      return;
    }
    if (amount === null || amount.trim() === "") {
      setError(t("amountInvalid"));
      return;
    }
    try {
      await addLineMutation.mutateAsync({ feeCategoryId, termId, dueDate, amount, isOptional });
      setFeeCategoryId("");
      setTermId("");
      setDueDate("");
      setAmount("");
      setIsOptional(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_160px_160px_160px_auto_auto]">
        <div className="space-y-1.5">
          <Label>{t("category")}</Label>
          <Combobox
            items={categoryItems}
            value={feeCategoryId}
            onChange={setFeeCategoryId}
            placeholder={t("selectCategory")}
            searchPlaceholder={t("searchCategory")}
            disabled={categoriesQuery.isLoading}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("term")}</Label>
          <Select value={termId} onValueChange={setTermId} disabled={termsQuery.isLoading}>
            <SelectTrigger>
              <SelectValue placeholder={t("selectTerm")} />
            </SelectTrigger>
            <SelectContent>
              {termsQuery.data?.map((term) => (
                <SelectItem key={term.id} value={term.id}>
                  {term.name}
                  {term.isCurrent ? " *" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("dueDate")}</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("amount")}</Label>
          <MoneyInput value={amount} onValueChange={(v) => setAmount(v ?? "")} currency={DEFAULT_CURRENCY} />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
          <input type="checkbox" checked={isOptional} onChange={(e) => setIsOptional(e.target.checked)} className="size-4 rounded border-input" />
          {t("optional")}
        </label>
        <Button type="button" className="self-end" onClick={handleAdd} disabled={addLineMutation.isPending}>
          {addLineMutation.isPending ? t("adding") : t("addLine")}
        </Button>
      </div>
    </div>
  );
}

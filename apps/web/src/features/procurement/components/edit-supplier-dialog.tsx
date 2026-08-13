"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import type { SupplierResponseDto, UpdateSupplierDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useUpdateSupplier } from "../hooks/use-suppliers";
import { CategoryTagsInput } from "./category-tags-input";

const NAME_MAX_LENGTH = 120; // proc_supplier.name is varchar(120) — supplier.dto.ts.
const TRADING_NAME_MAX_LENGTH = 120; // proc_supplier.trading_name is varchar(120) — supplier.dto.ts.
const KRA_PIN_MAX_LENGTH = 15; // proc_supplier.kra_pin is varchar(15) — supplier.dto.ts.

function readEmail(contacts: Record<string, unknown>): string {
  return typeof contacts.email === "string" ? contacts.email : "";
}

function categoriesEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Phase 6 Slice 18 Part 1 (Procurement, Module 12) — a plain two-way diff
 * (only fields that actually changed are sent), matching
 * `edit-cost-center-dialog.tsx`'s own established shape for a DTO with no
 * three-way-null complexity to handle.
 *
 * **A real, documented gap, not an oversight**: `tradingName`/`kraPin` are
 * NOT null-clearable from this dialog — blanking either input back to empty
 * simply omits the field from the PATCH body (leaving the server-side value
 * unchanged), it does not send `null`. `@klickit/contracts`'s own zod-inferred
 * `UpdateSupplierDto.tradingName`/`.kraPin` type as `string | undefined` (no
 * `null` in the union — see `suppliers.api.ts`'s own doc comment on this
 * exact, real codegen-mirror gap), so constructing `{tradingName: null}`
 * against that type is a genuine `tsc` error, not a stylistic choice. Adding
 * a cast-based three-way diff (the `controlDomain`/`taxTreatment` pattern
 * `edit-account-dialog.tsx` already established) was judged not worth it for
 * this pass — the plan's own scope never calls out null-clearing these two
 * fields, and once genuinely needed, the fix is a straightforward,
 * well-precedented `as unknown as {...}` cast at this one call site.
 *
 * `contacts`' only UI-editable key is `email` (per the plan's own scope) —
 * any OTHER keys already present on `supplier.contacts` (e.g. set by a
 * future integration) are preserved verbatim, never dropped, by spreading
 * the existing object before applying the `email` change.
 */
export function EditSupplierDialog({ supplier }: { supplier: SupplierResponseDto }) {
  const t = useTranslations("procurement.suppliers.editDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(supplier.name);
  const [tradingName, setTradingName] = React.useState(supplier.tradingName ?? "");
  const [kraPin, setKraPin] = React.useState(supplier.kraPin ?? "");
  const [email, setEmail] = React.useState(readEmail(supplier.contacts));
  const [categories, setCategories] = React.useState<string[]>(supplier.categories);
  const [paymentTermsDays, setPaymentTermsDays] = React.useState(String(supplier.paymentTermsDays));
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateSupplier();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName(supplier.name);
      setTradingName(supplier.tradingName ?? "");
      setKraPin(supplier.kraPin ?? "");
      setEmail(readEmail(supplier.contacts));
      setCategories(supplier.categories);
      setPaymentTermsDays(String(supplier.paymentTermsDays));
      setError(null);
    }
  }

  const parsedPaymentTermsDays = Number(paymentTermsDays);
  const paymentTermsDaysValid = Number.isInteger(parsedPaymentTermsDays) && parsedPaymentTermsDays >= 0;
  const canSubmit = name.trim().length > 0 && paymentTermsDaysValid;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);

    const dto: UpdateSupplierDto = {};
    if (name.trim() !== supplier.name) dto.name = name.trim();

    const trimmedTradingName = tradingName.trim();
    if (trimmedTradingName && trimmedTradingName !== (supplier.tradingName ?? "")) dto.tradingName = trimmedTradingName;

    const trimmedKraPin = kraPin.trim();
    if (trimmedKraPin && trimmedKraPin !== (supplier.kraPin ?? "")) dto.kraPin = trimmedKraPin;

    const trimmedEmail = email.trim();
    const originalEmail = readEmail(supplier.contacts);
    if (trimmedEmail !== originalEmail) {
      const nextContacts = { ...supplier.contacts };
      if (trimmedEmail) {
        nextContacts.email = trimmedEmail;
      } else {
        delete nextContacts.email;
      }
      dto.contacts = nextContacts;
    }

    if (!categoriesEqual(categories, supplier.categories)) dto.categories = categories;
    if (parsedPaymentTermsDays !== supplier.paymentTermsDays) dto.paymentTermsDays = parsedPaymentTermsDays;

    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: supplier.id, dto });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Pencil className="size-4" />
          {tCommon("edit")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title", { name: supplier.name })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("nameLabel")}</Label>
            <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("tradingNameLabel")}</Label>
              <Input value={tradingName} maxLength={TRADING_NAME_MAX_LENGTH} onChange={(e) => setTradingName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("kraPinLabel")}</Label>
              <Input value={kraPin} maxLength={KRA_PIN_MAX_LENGTH} onChange={(e) => setKraPin(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("emailLabel")}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("emailPlaceholder")} />
            <p className="text-xs text-muted-foreground">{t("emailHint")}</p>
          </div>

          <div className="space-y-1.5">
            <Label>{t("categoriesLabel")}</Label>
            <CategoryTagsInput value={categories} onChange={setCategories} placeholder={t("categoriesPlaceholder")} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("paymentTermsDaysLabel")}</Label>
            <Input type="number" min={0} value={paymentTermsDays} onChange={(e) => setPaymentTermsDays(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || updateMutation.isPending}>
            {updateMutation.isPending ? t("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

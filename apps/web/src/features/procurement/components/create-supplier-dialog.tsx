"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreateSupplierDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useCreateSupplier } from "../hooks/use-suppliers";
import { CategoryTagsInput } from "./category-tags-input";

const NAME_MAX_LENGTH = 120; // proc_supplier.name is varchar(120) — supplier.dto.ts.
const TRADING_NAME_MAX_LENGTH = 120; // proc_supplier.trading_name is varchar(120) — supplier.dto.ts.
const KRA_PIN_MAX_LENGTH = 15; // proc_supplier.kra_pin is varchar(15) — supplier.dto.ts.
const DEFAULT_PAYMENT_TERMS_DAYS = 30; // CreateSupplierDto.paymentTermsDays's own Swagger `default` — see suppliers.api.ts's own doc comment on the codegen gap this triggers.

/**
 * Phase 6 Slice 18 Part 1 (Procurement, Module 12) — the supplier create
 * form. `contacts`/`paymentDetails` are opaque `Record<string, unknown>`
 * server-side (confirmed by reading `supplier.dto.ts` directly — plain
 * `@IsObject()`, no nested shape validation) — per the plan's own explicit
 * scope, this dialog builds only a single `email` field mapped into
 * `contacts` (the one key `SuppliersService`/a future remittance-advice
 * flow actually reads, FR-PROC-008.1), and OMITS `paymentDetails` entirely
 * (not needed by any other Part 1 flow) rather than building a generic
 * key-value editor for either.
 *
 * `paymentTermsDays` defaults to 30 in the UI (matching the backend's own
 * Swagger `default`) but is still sent explicitly on every create — this
 * dialog never relies on omitting the field and trusting the server to fill
 * in 30 itself, since a blank/zero value is a legitimate distinct choice
 * (net-0/due-on-receipt) an admin might make.
 */
export function CreateSupplierDialog() {
  const t = useTranslations("procurement.suppliers.createDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [tradingName, setTradingName] = React.useState("");
  const [kraPin, setKraPin] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [categories, setCategories] = React.useState<string[]>([]);
  const [paymentTermsDays, setPaymentTermsDays] = React.useState(String(DEFAULT_PAYMENT_TERMS_DAYS));
  const [error, setError] = React.useState<string | null>(null);
  const createMutation = useCreateSupplier();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName("");
      setTradingName("");
      setKraPin("");
      setEmail("");
      setCategories([]);
      setPaymentTermsDays(String(DEFAULT_PAYMENT_TERMS_DAYS));
      setError(null);
    }
  }

  const parsedPaymentTermsDays = Number(paymentTermsDays);
  const paymentTermsDaysValid =
    paymentTermsDays.trim() === "" || (Number.isInteger(parsedPaymentTermsDays) && parsedPaymentTermsDays >= 0);
  const canSubmit = name.trim().length > 0 && paymentTermsDaysValid;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: CreateSupplierDto = {
      name: name.trim(),
      ...(tradingName.trim() ? { tradingName: tradingName.trim() } : {}),
      ...(kraPin.trim() ? { kraPin: kraPin.trim() } : {}),
      ...(email.trim() ? { contacts: { email: email.trim() } } : {}),
      ...(categories.length > 0 ? { categories } : {}),
      ...(paymentTermsDays.trim() !== "" ? { paymentTermsDays: parsedPaymentTermsDays } : {}),
    };
    try {
      await createMutation.mutateAsync(dto);
      setOpen(false);
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
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
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
            <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("tradingNameLabel")}</Label>
              <Input
                value={tradingName}
                maxLength={TRADING_NAME_MAX_LENGTH}
                onChange={(e) => setTradingName(e.target.value)}
                placeholder={t("tradingNamePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("kraPinLabel")}</Label>
              <Input value={kraPin} maxLength={KRA_PIN_MAX_LENGTH} onChange={(e) => setKraPin(e.target.value)} placeholder={t("kraPinPlaceholder")} />
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
            <p className="text-xs text-muted-foreground">{t("paymentTermsDaysHint")}</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? t("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

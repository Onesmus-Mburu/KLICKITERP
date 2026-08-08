"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/patterns/money-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { GlAccountSelect } from "@/features/billing/components/gl-account-select";
import type { ServicePointResponseDto } from "@klickit/contracts";
import { WALLET_SERVICE_POINT_TYPES } from "../constants";
import { useCreateServicePoint, useUpdateServicePoint } from "../hooks/use-service-points";

/**
 * Phase 6 Slice 11 (Part 3) — `POST`/`PATCH wallet-service-points`
 * (`wallet:service-point:manage`). Two exported components (create/edit)
 * rather than one mode-branching form — mirrors `CreateServicePointDto` vs
 * `UpdateServicePointDto`'s genuinely different real shapes (create needs
 * `name`/`type`/`glIncomeAccountId`(+optional `perTxnLimit`); update is
 * `name`/`perTxnLimit`/`isActive` ONLY — `type`/`glIncomeAccountId` are
 * immutable post-creation, not even present in the update DTO, confirmed by
 * reading `service-point.dto.ts` directly), same "two distinct dialogs, not
 * a generic form" precedent Slice 11 (Part 1)'s Custom Field Definitions
 * screen already established for the identical immutable-after-create shape.
 *
 * `GlAccountSelect` (`features/billing/components/gl-account-select.tsx`) is
 * reused verbatim, cross-feature — the plan's own instruction ("check if a
 * reusable GlAccountSelect-shaped picker already exists — reuse if so"):
 * confirmed it's already generic (`GET /accounting/accounts`, not
 * fee-category-specific), so no wallet-local fork was built.
 */
export function CreateServicePointDialog() {
  const t = useTranslations("wallet.servicePoints.createDialog");
  const tSpType = useTranslations("wallet.servicePointTypes");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<string>("");
  const [glIncomeAccountId, setGlIncomeAccountId] = React.useState("");
  const [perTxnLimit, setPerTxnLimit] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const mutation = useCreateServicePoint();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName("");
      setType("");
      setGlIncomeAccountId("");
      setPerTxnLimit(null);
      setError(null);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!name.trim() || !type || !glIncomeAccountId) {
      setError(t("validationError"));
      return;
    }
    try {
      await mutation.mutateAsync({
        name: name.trim(),
        type: type as (typeof WALLET_SERVICE_POINT_TYPES)[number],
        glIncomeAccountId,
        perTxnLimit: perTxnLimit ?? undefined,
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>{t("trigger")}</Button>
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

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("nameLabel")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("typeLabel")}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectType")} />
              </SelectTrigger>
              <SelectContent>
                {WALLET_SERVICE_POINT_TYPES.map((tp) => (
                  <SelectItem key={tp} value={tp}>
                    {tSpType(tp)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("glIncomeAccountLabel")}</Label>
            <GlAccountSelect value={glIncomeAccountId} onChange={setGlIncomeAccountId} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("perTxnLimitLabel")}</Label>
            <MoneyInput value={perTxnLimit ?? ""} onValueChange={setPerTxnLimit} currency={DEFAULT_CURRENCY} />
            <p className="text-xs text-muted-foreground">{t("perTxnLimitHint")}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={mutation.isPending}>
            {mutation.isPending ? t("submitting") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditServicePointDialog({ servicePoint }: { servicePoint: ServicePointResponseDto }) {
  const t = useTranslations("wallet.servicePoints.editDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(servicePoint.name);
  const [perTxnLimit, setPerTxnLimit] = React.useState<string | null>(servicePoint.perTxnLimit);
  const [isActive, setIsActive] = React.useState(servicePoint.isActive);
  const [error, setError] = React.useState<string | null>(null);
  const mutation = useUpdateServicePoint(servicePoint.id);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName(servicePoint.name);
      setPerTxnLimit(servicePoint.perTxnLimit);
      setIsActive(servicePoint.isActive);
      setError(null);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError(t("validationError"));
      return;
    }
    try {
      await mutation.mutateAsync({
        name: name.trim(),
        perTxnLimit: perTxnLimit ?? undefined,
        isActive,
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {tCommon("edit")}
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

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("nameLabel")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("perTxnLimitLabel")}</Label>
            <MoneyInput value={perTxnLimit ?? ""} onValueChange={setPerTxnLimit} currency={DEFAULT_CURRENCY} />
            <p className="text-xs text-muted-foreground">{t("perTxnLimitHint")}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isActive} onChange={() => setIsActive((v) => !v)} />
            {t("isActiveLabel")}
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={mutation.isPending}>
            {mutation.isPending ? t("submitting") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

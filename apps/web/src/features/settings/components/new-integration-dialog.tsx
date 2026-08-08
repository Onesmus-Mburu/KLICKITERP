"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { CONFIGURABLE_INTEGRATION_KINDS, INTEGRATION_KINDS } from "../constants";
import { useCreateIntegrationConfig } from "../hooks/use-integration-configs";
import type { IntegrationKind, MpesaConfig, QuickBooksConfig, SageConfig, XeroConfig } from "../types";
import { EMPTY_MPESA_CONFIG, MpesaConfigForm, isMpesaConfigComplete } from "./mpesa-config-form";
import { EMPTY_QUICKBOOKS_CONFIG, QuickBooksConfigForm, isQuickBooksConfigComplete } from "./quickbooks-config-form";
import { EMPTY_XERO_CONFIG, XeroConfigForm, isXeroConfigComplete } from "./xero-config-form";
import { EMPTY_SAGE_CONFIG, SageConfigForm, isSageConfigComplete } from "./sage-config-form";

/**
 * "New Integration" flow, per the plan: a kind `<Select>` — `MPESA`/
 * `QUICKBOOKS`/`XERO`/`SAGE` each get a real form in this pass; every other
 * kind still shows a clear "not yet configurable in this UI" placeholder
 * rather than a broken/empty form (`CONFIGURABLE_INTEGRATION_KINDS`,
 * `../constants.ts`).
 *
 * Phase 6 Slice 11 Part 4 — this is now GENUINE branching logic, not the
 * single MPESA-hardcoded path it used to be: each configurable kind gets its
 * OWN controlled-form state (`mpesaConfig`/`quickbooksConfig`/`xeroConfig`/
 * `sageConfig`), and `currentConfigPayload()`/`isCurrentConfigComplete()`
 * switch on `kind` to pick the right one at submit time — mirroring the same
 * explicit-switch style `AccountingSyncResolverService.build()`
 * (`packages/server`) already uses for the analogous per-kind adapter
 * selection. Always submits a full, freshly-typed config object — never a
 * pre-filled one, since `configEnc` is never readable back over HTTP (see
 * `../api/integration-configs.api.ts`'s own doc comment).
 */
export function NewIntegrationDialog() {
  const t = useTranslations("settings.integrations");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<IntegrationKind>("MPESA");
  const [name, setName] = React.useState("");
  const [isEnabled, setIsEnabled] = React.useState(true);
  const [priority, setPriority] = React.useState(0);
  const [mpesaConfig, setMpesaConfig] = React.useState<MpesaConfig>(EMPTY_MPESA_CONFIG);
  const [quickbooksConfig, setQuickbooksConfig] = React.useState<QuickBooksConfig>(EMPTY_QUICKBOOKS_CONFIG);
  const [xeroConfig, setXeroConfig] = React.useState<XeroConfig>(EMPTY_XERO_CONFIG);
  const [sageConfig, setSageConfig] = React.useState<SageConfig>(EMPTY_SAGE_CONFIG);
  const [error, setError] = React.useState<string | null>(null);
  const createMutation = useCreateIntegrationConfig();

  const isConfigurable = CONFIGURABLE_INTEGRATION_KINDS.includes(kind);

  function resetConfigs() {
    setMpesaConfig(EMPTY_MPESA_CONFIG);
    setQuickbooksConfig(EMPTY_QUICKBOOKS_CONFIG);
    setXeroConfig(EMPTY_XERO_CONFIG);
    setSageConfig(EMPTY_SAGE_CONFIG);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setKind("MPESA");
      setName("");
      setIsEnabled(true);
      setPriority(0);
      resetConfigs();
      setError(null);
    }
  }

  function isCurrentConfigComplete(): boolean {
    switch (kind) {
      case "MPESA":
        return isMpesaConfigComplete(mpesaConfig);
      case "QUICKBOOKS":
        return isQuickBooksConfigComplete(quickbooksConfig);
      case "XERO":
        return isXeroConfigComplete(xeroConfig);
      case "SAGE":
        return isSageConfigComplete(sageConfig);
      default:
        return false;
    }
  }

  function currentConfigPayload(): Record<string, unknown> {
    switch (kind) {
      case "MPESA":
        return mpesaConfig as unknown as Record<string, unknown>;
      case "QUICKBOOKS":
        return quickbooksConfig as unknown as Record<string, unknown>;
      case "XERO":
        return xeroConfig as unknown as Record<string, unknown>;
      case "SAGE":
        return sageConfig as unknown as Record<string, unknown>;
      default:
        return {};
    }
  }

  const canSubmit = isConfigurable && name.trim().length > 0 && isCurrentConfigComplete();

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await createMutation.mutateAsync({
        kind,
        name: name.trim(),
        config: currentConfigPayload(),
        isEnabled,
        priority,
      });
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
          {t("newIntegration")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("newIntegrationTitle")}</DialogTitle>
          <DialogDescription>{t("newIntegrationDescription")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("kind")}</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as IntegrationKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTEGRATION_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label required>{t("name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} maxLength={60} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("priority")}</Label>
              <Input type="number" min={0} value={priority} onChange={(e) => setPriority(Number(e.target.value) || 0)} />
              <p className="text-xs text-muted-foreground">{t("priorityHint")}</p>
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
              <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} className="size-4 rounded border-input" />
              {t("isEnabledLabel")}
            </label>
          </div>

          {kind === "MPESA" && <MpesaConfigForm value={mpesaConfig} onChange={setMpesaConfig} disabled={createMutation.isPending} />}
          {kind === "QUICKBOOKS" && <QuickBooksConfigForm value={quickbooksConfig} onChange={setQuickbooksConfig} disabled={createMutation.isPending} />}
          {kind === "XERO" && <XeroConfigForm value={xeroConfig} onChange={setXeroConfig} disabled={createMutation.isPending} />}
          {kind === "SAGE" && <SageConfigForm value={sageConfig} onChange={setSageConfig} disabled={createMutation.isPending} />}
          {!isConfigurable && (
            <Alert variant="warning">
              <AlertDescription>{t("notYetConfigurable", { kind })}</AlertDescription>
            </Alert>
          )}
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

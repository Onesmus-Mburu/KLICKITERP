"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
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
import { ApiError } from "@/lib/api-error";
import { CONFIGURABLE_INTEGRATION_KINDS } from "../constants";
import { useUpdateIntegrationConfig } from "../hooks/use-integration-configs";
import type { IntegrationConfig, MpesaConfig, QuickBooksConfig, SageConfig, XeroConfig } from "../types";
import { EMPTY_MPESA_CONFIG, MpesaConfigForm, isMpesaConfigComplete } from "./mpesa-config-form";
import { EMPTY_QUICKBOOKS_CONFIG, QuickBooksConfigForm, isQuickBooksConfigComplete } from "./quickbooks-config-form";
import { EMPTY_XERO_CONFIG, XeroConfigForm, isXeroConfigComplete } from "./xero-config-form";
import { EMPTY_SAGE_CONFIG, SageConfigForm, isSageConfigComplete } from "./sage-config-form";

/**
 * Edit flow, per the plan's own explicit design constraint: `configEnc` can
 * never be read back (see `../api/integration-configs.api.ts`'s own doc
 * comment), so this is "resubmit the full configuration," NOT a partial-field
 * edit with pre-filled secrets. Name/enabled/priority are ordinary,
 * pre-filled, freely-editable fields (`UpdateIntegrationConfigDto` makes
 * `config` genuinely optional — these three can change without touching
 * credentials at all). Credentials themselves are behind an explicit,
 * OFF-by-default "resubmit credentials" checkbox that reveals a completely
 * BLANK form — never pre-filled with placeholder/masked values that would
 * misleadingly suggest the old secret is still there.
 *
 * Phase 6 Slice 11 Part 4 — `config.kind` is immutable post-creation (not
 * even present in `UpdateIntegrationConfigDto`), so this dialog genuinely
 * branches on the EXISTING config's kind to pick the matching form/state/
 * validator (`MPESA`/`QUICKBOOKS`/`XERO`/`SAGE`) instead of the previous
 * `config.kind === "MPESA"` single-kind check — real branching logic, not
 * just an additive registration.
 */
export function EditIntegrationDialog({ config }: { config: IntegrationConfig }) {
  const t = useTranslations("settings.integrations");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(config.name);
  const [isEnabled, setIsEnabled] = React.useState(config.isEnabled);
  const [priority, setPriority] = React.useState(config.priority);
  const [resubmitCredentials, setResubmitCredentials] = React.useState(false);
  const [mpesaConfig, setMpesaConfig] = React.useState<MpesaConfig>(EMPTY_MPESA_CONFIG);
  const [quickbooksConfig, setQuickbooksConfig] = React.useState<QuickBooksConfig>(EMPTY_QUICKBOOKS_CONFIG);
  const [xeroConfig, setXeroConfig] = React.useState<XeroConfig>(EMPTY_XERO_CONFIG);
  const [sageConfig, setSageConfig] = React.useState<SageConfig>(EMPTY_SAGE_CONFIG);
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateIntegrationConfig();

  const isConfigurable = CONFIGURABLE_INTEGRATION_KINDS.includes(config.kind);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName(config.name);
      setIsEnabled(config.isEnabled);
      setPriority(config.priority);
      setResubmitCredentials(false);
      setMpesaConfig(EMPTY_MPESA_CONFIG);
      setQuickbooksConfig(EMPTY_QUICKBOOKS_CONFIG);
      setXeroConfig(EMPTY_XERO_CONFIG);
      setSageConfig(EMPTY_SAGE_CONFIG);
      setError(null);
    }
  }

  function isCurrentConfigComplete(): boolean {
    switch (config.kind) {
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
    switch (config.kind) {
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

  const canSubmit = name.trim().length > 0 && (!resubmitCredentials || isCurrentConfigComplete());

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await updateMutation.mutateAsync({
        id: config.id,
        input: {
          name: name.trim(),
          isEnabled,
          priority,
          ...(resubmitCredentials ? { config: currentConfigPayload() } : {}),
        },
      });
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
          {t("editTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("editTitle", { name: config.name })}</DialogTitle>
          <DialogDescription>{t("editDescription")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("priority")}</Label>
              <Input type="number" min={0} value={priority} onChange={(e) => setPriority(Number(e.target.value) || 0)} />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
              <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} className="size-4 rounded border-input" />
              {t("isEnabledLabel")}
            </label>
          </div>

          {isConfigurable && (
            <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={resubmitCredentials}
                  onChange={(e) => setResubmitCredentials(e.target.checked)}
                  className="size-4 rounded border-input"
                />
                {t("resubmitCredentialsLabel")}
              </label>
              <p className="text-xs text-muted-foreground">{t("resubmitCredentialsHint")}</p>
              {resubmitCredentials && config.kind === "MPESA" && (
                <MpesaConfigForm value={mpesaConfig} onChange={setMpesaConfig} disabled={updateMutation.isPending} />
              )}
              {resubmitCredentials && config.kind === "QUICKBOOKS" && (
                <QuickBooksConfigForm value={quickbooksConfig} onChange={setQuickbooksConfig} disabled={updateMutation.isPending} />
              )}
              {resubmitCredentials && config.kind === "XERO" && (
                <XeroConfigForm value={xeroConfig} onChange={setXeroConfig} disabled={updateMutation.isPending} />
              )}
              {resubmitCredentials && config.kind === "SAGE" && (
                <SageConfigForm value={sageConfig} onChange={setSageConfig} disabled={updateMutation.isPending} />
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || updateMutation.isPending}>
            {updateMutation.isPending ? t("saving") : t("saveButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

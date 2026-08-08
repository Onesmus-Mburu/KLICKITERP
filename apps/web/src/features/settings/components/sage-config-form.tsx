"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SageConfig } from "../types";

/**
 * Phase 6 Slice 11 Part 4 — controlled form for `SageConfig`, the exact real
 * field names `SageAdapter`'s own config interface declares (see
 * `../types.ts`'s own doc comment). `clientSecret`/`refreshToken` are masked
 * (`type="password"`) — same convention `<MpesaConfigForm>`/
 * `<QuickBooksConfigForm>`/`<XeroConfigForm>` establish. Reused verbatim by
 * BOTH `<NewIntegrationDialog>` and `<EditIntegrationDialog>`'s "resubmit
 * credentials" branch.
 */
export function SageConfigForm({ value, onChange, disabled }: { value: SageConfig; onChange: (next: SageConfig) => void; disabled?: boolean }) {
  const t = useTranslations("settings.integrations.sageForm");

  function set<K extends keyof SageConfig>(key: K, v: SageConfig[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label required>{t("clientId")}</Label>
        <Input value={value.clientId} onChange={(e) => set("clientId", e.target.value)} disabled={disabled} placeholder={t("clientIdPlaceholder")} />
      </div>
      <div className="space-y-1.5">
        <Label required>{t("clientSecret")}</Label>
        <Input
          type="password"
          value={value.clientSecret}
          onChange={(e) => set("clientSecret", e.target.value)}
          disabled={disabled}
          placeholder={t("clientSecretPlaceholder")}
        />
      </div>
      <div className="space-y-1.5">
        <Label required>{t("refreshToken")}</Label>
        <Input
          type="password"
          value={value.refreshToken}
          onChange={(e) => set("refreshToken", e.target.value)}
          disabled={disabled}
          placeholder={t("refreshTokenPlaceholder")}
        />
      </div>
      <div className="space-y-1.5">
        <Label>{t("timeoutMs")}</Label>
        <Input
          type="number"
          min={0}
          value={value.timeoutMs ?? ""}
          onChange={(e) => set("timeoutMs", e.target.value === "" ? undefined : Number(e.target.value))}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

export const EMPTY_SAGE_CONFIG: SageConfig = {
  clientId: "",
  clientSecret: "",
  refreshToken: "",
  timeoutMs: undefined,
};

/** `SageConfig`'s own required fields (per `../types.ts` — the ones with no `?`) — gates the submit button before a wasted round trip. */
export function isSageConfigComplete(value: SageConfig): boolean {
  return Boolean(value.clientId && value.clientSecret && value.refreshToken);
}

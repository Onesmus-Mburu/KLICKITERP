"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreatePyrlComponentDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { useAccounts as useGlAccounts } from "@/features/accounting/hooks/use-accounts";
import { useCreateComponent } from "../hooks/use-components";

const CODE_MAX_LENGTH = 20; // pyrl_component.code — component.dto.ts's own @MaxLength(20).
const NAME_MAX_LENGTH = 120; // pyrl_component.name — @MaxLength(120).

const COMPONENT_KINDS = ["EARNING", "DEDUCTION"] as const;

/**
 * Phase 6 Slice 22 Part 1 (Payroll foundations, Module 15) — the payroll
 * component create form: `code` + `kind` (both create-only/immutable after
 * this — `edit-component-dialog.tsx` omits both entirely, confirmed by
 * reading `UpdatePyrlComponentDto` directly) + `name` + `isTaxable`/
 * `isStatutory` checkboxes + a required `glAccountId` picker.
 *
 * **`code` is permanent and load-bearing** — the run-computation engine looks
 * up 8 real seeded rows (`BASIC`/`HOUSE_ALLOWANCE`/`PAYE`/`NSSF`/`SHIF`/
 * `AHL`/`LOAN_RECOVERY`/`OTHER_DEDUCTION`) BY EXACT CODE STRING via hardcoded
 * constants elsewhere in the backend, per this part's own task brief — this
 * form surfaces that as real, visible context (not decorative copy) right
 * next to the `code` input itself, since this is the one moment a wrong or
 * throwaway `code` becomes permanent.
 *
 * **GL account picker**: reuses `features/accounting/hooks/use-accounts.ts`
 * exactly like `create-account-dialog.tsx` (Banking, Slice 21 Part 1) —
 * `isActive` server-side + `isPostable` client-side. `PyrlComponentEntity`'s
 * own `glAccountId` FK is `RESTRICT`, no class restriction beyond
 * active+postable (confirmed by reading `ComponentsService`/the entity
 * directly), so this picker doesn't invent a class restriction either.
 *
 * **No clean 409 on duplicate `code` before this part's own opportunistic
 * fix — now a real 409**, surfaced verbatim via `ApiError.message` (see
 * `components.api.ts`'s own doc comment for the fix itself).
 */
export function CreateComponentDialog() {
  const t = useTranslations("payroll.components.createDialog");
  const tKinds = useTranslations("payroll.components.kinds");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<(typeof COMPONENT_KINDS)[number]>("EARNING");
  const [isTaxable, setIsTaxable] = React.useState(false);
  const [isStatutory, setIsStatutory] = React.useState(false);
  const [glAccountId, setGlAccountId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateComponent();
  const glAccountsQuery = useGlAccounts({ isActive: true });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setCode("");
      setName("");
      setKind("EARNING");
      setIsTaxable(false);
      setIsStatutory(false);
      setGlAccountId("");
      setError(null);
    }
  }

  const glAccountItems = React.useMemo(
    () => (glAccountsQuery.data ?? []).filter((a) => a.isPostable && a.isActive).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
    [glAccountsQuery.data],
  );
  const canSubmit = code.trim().length > 0 && name.trim().length > 0 && !!glAccountId;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: CreatePyrlComponentDto = {
      code: code.trim(),
      name: name.trim(),
      kind,
      isTaxable,
      isStatutory,
      glAccountId,
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("codeLabel")}</Label>
              <Input value={code} maxLength={CODE_MAX_LENGTH} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t("codePlaceholder")} />
              <p className="text-xs text-muted-foreground">{t("codeHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label required>{t("kindLabel")}</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as (typeof COMPONENT_KINDS)[number])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPONENT_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {tKinds(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("kindHint")}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label required>{t("nameLabel")}</Label>
            <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
          </div>

          <div className="space-y-1.5">
            <Label required>{t("glAccountLabel")}</Label>
            <Combobox
              items={glAccountItems}
              value={glAccountId}
              onChange={setGlAccountId}
              placeholder={glAccountsQuery.isLoading ? t("loadingAccounts") : t("glAccountPlaceholder")}
              searchPlaceholder={t("glAccountSearchPlaceholder")}
              emptyText={t("glAccountEmptyText")}
              disabled={glAccountsQuery.isLoading}
            />
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox checked={isTaxable} onChange={(e) => setIsTaxable(e.target.checked)} />
              {t("isTaxableLabel")}
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox checked={isStatutory} onChange={(e) => setIsStatutory(e.target.checked)} />
              {t("isStatutoryLabel")}
            </label>
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

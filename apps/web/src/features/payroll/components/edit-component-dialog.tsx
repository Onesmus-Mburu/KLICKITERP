"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import type { PyrlComponentResponseDto, UpdatePyrlComponentDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useAccounts as useGlAccounts } from "@/features/accounting/hooks/use-accounts";
import { useUpdateComponent } from "../hooks/use-components";

const NAME_MAX_LENGTH = 120;

/**
 * Phase 6 Slice 22 Part 1 (Payroll foundations, Module 15) —
 * `UpdatePyrlComponentDto` only allows `name?`/`isTaxable?`/`isStatutory?`/
 * `glAccountId?` (confirmed by reading `component.dto.ts`/
 * `ComponentsController.update()` directly). `code`/`kind` are OMITTED from
 * this form entirely, not disabled — create-only/immutable, and `code`
 * specifically is load-bearing for the run-computation engine's own
 * hardcoded lookups on the 8 real seeded rows (see `create-component-dialog.tsx`'s
 * own doc comment) — this dialog's header repeats that warning for whichever
 * of the 8 seeded rows an admin opens this on, not just at create time.
 */
export function EditComponentDialog({ component }: { component: PyrlComponentResponseDto }) {
  const t = useTranslations("payroll.components.editDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(component.name);
  const [isTaxable, setIsTaxable] = React.useState(component.isTaxable);
  const [isStatutory, setIsStatutory] = React.useState(component.isStatutory);
  const [glAccountId, setGlAccountId] = React.useState(component.glAccountId);
  const [error, setError] = React.useState<string | null>(null);

  const updateMutation = useUpdateComponent();
  const glAccountsQuery = useGlAccounts({ isActive: true });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName(component.name);
      setIsTaxable(component.isTaxable);
      setIsStatutory(component.isStatutory);
      setGlAccountId(component.glAccountId);
      setError(null);
    }
  }

  const glAccountItems = React.useMemo(
    () => (glAccountsQuery.data ?? []).filter((a) => a.isPostable && a.isActive).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
    [glAccountsQuery.data],
  );
  const canSubmit = name.trim().length > 0 && !!glAccountId;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: UpdatePyrlComponentDto = {};
    if (name.trim() !== component.name) dto.name = name.trim();
    if (isTaxable !== component.isTaxable) dto.isTaxable = isTaxable;
    if (isStatutory !== component.isStatutory) dto.isStatutory = isStatutory;
    if (glAccountId !== component.glAccountId) dto.glAccountId = glAccountId;

    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: component.id, dto });
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { name: component.name })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <Alert variant="warning">
          <AlertDescription>{t("codeImmutableWarning", { code: component.code })}</AlertDescription>
        </Alert>

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
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || updateMutation.isPending}>
            {updateMutation.isPending ? t("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

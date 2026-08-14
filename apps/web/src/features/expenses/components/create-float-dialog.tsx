"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreateFloatDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/patterns/money-input";
import { ApiError } from "@/lib/api-error";
import { useUsersLookup } from "@/features/departments/hooks/use-users-lookup";
import { useCreateFloat } from "../hooks/use-petty-cash";

/**
 * Phase 6 Slice 20 Part 2 (Petty Cash, Module 14) — creates a petty cash
 * float: a custodian `<Combobox>` (reuses `features/departments/hooks/use-users-lookup.ts`,
 * the same "no per-feature user list needed" picker `create-voucher-dialog.tsx`'s
 * own STAFF `payeeType` sub-form already established in Part 1 — checked
 * first per this part's own brief rather than building a duplicate) and a
 * `<MoneyInput>` ceiling. **One float per custodian** — server-enforced via a
 * unique constraint (`PettyCashService.createFloat()`'s own `isUniqueViolation()`
 * check, surfaced as a real 409), not pre-validated client-side (this dialog
 * doesn't fetch every existing float's own `custodianUserId` just to
 * pre-filter the picker — the server's own conflict message is clear enough,
 * matching this codebase's established "don't duplicate server validation
 * client-side beyond what the picker itself naturally narrows" precedent,
 * e.g. `create-category-dialog.tsx`'s own BR-EXP-01 account picker).
 *
 * `balance` is never asked for here — it starts equal to `ceiling`
 * ("fully funded on creation", `PettyCashService.createFloat()`'s own
 * documented judgement call) with no separate "fund the float" step.
 *
 * On success, navigates straight to the new float's detail page — matches
 * `create-voucher-dialog.tsx`'s own "land on the new document" precedent.
 */
export function CreateFloatDialog() {
  const t = useTranslations("expenses.pettyCash.floats.createDialog");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [custodianUserId, setCustodianUserId] = React.useState("");
  const [ceiling, setCeiling] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateFloat();
  const usersQuery = useUsersLookup();

  function resetForm() {
    setCustodianUserId("");
    setCeiling(null);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) resetForm();
  }

  const staffItems = React.useMemo(
    () => (usersQuery.data?.items ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})` })),
    [usersQuery.data],
  );

  const canSubmit = !!custodianUserId && !!ceiling && !createMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit || !ceiling) return;
    setError(null);
    const dto: CreateFloatDto = { custodianUserId, ceiling };
    try {
      const created = await createMutation.mutateAsync(dto);
      setOpen(false);
      router.push(`/expenses/petty-cash/${created.id}`);
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

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label required>{t("custodianLabel")}</Label>
            <Combobox
              items={staffItems}
              value={custodianUserId}
              onChange={setCustodianUserId}
              placeholder={usersQuery.isLoading ? t("loadingUsers") : t("selectCustodianPlaceholder")}
              searchPlaceholder={t("searchUsers")}
              emptyText={t("noUsersFound")}
              disabled={usersQuery.isLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("ceilingLabel")}</Label>
            <MoneyInput value={ceiling ?? ""} onValueChange={setCeiling} />
            <p className="text-xs text-muted-foreground">{t("ceilingHint")}</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {createMutation.isPending ? t("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

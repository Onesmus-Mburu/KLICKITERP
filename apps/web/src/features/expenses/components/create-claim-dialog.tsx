"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreateClaimDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { useUsersLookup } from "@/features/departments/hooks/use-users-lookup";
import { CLAIM_REIMBURSE_VIA, useCreateClaim, type ClaimReimburseVia } from "../hooks/use-claims";

/**
 * Phase 6 Slice 20 Part 3 (Staff Claims, Module 14) — creates a DRAFT claim
 * header ONLY: a staff `<Combobox>` (reuses
 * `features/departments/hooks/use-users-lookup.ts`, the exact same STAFF
 * picker `create-voucher-dialog.tsx` (Part 1) and `create-float-dialog.tsx`
 * (Part 2) already established — checked first per this part's own brief
 * rather than building a duplicate) and a `reimburseVia` `<Select>`
 * (PAYROLL/DIRECT). No lines here — `CreateClaimDto` has no `lines` field at
 * all (confirmed directly); they're added afterward on the detail page via
 * `<ClaimLineEditor>`.
 *
 * **`reimburseVia` is set once here and can NEVER change afterward** — no
 * PATCH exists anywhere on the claim header (confirmed by reading
 * `ClaimsController` directly, see `claims.api.ts`'s own doc comment) — the
 * hint text below makes this explicit so a user doesn't pick casually
 * expecting to fix it later; the real fix is creating a new claim.
 *
 * On success, navigates straight to the new claim's detail page — matches
 * `create-voucher-dialog.tsx`/`create-float-dialog.tsx`'s own "land on the
 * new document" precedent.
 */
export function CreateClaimDialog() {
  const t = useTranslations("expenses.claims.createDialog");
  const tReimburseVia = useTranslations("expenses.claims.reimburseVia");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [staffUserId, setStaffUserId] = React.useState("");
  const [reimburseVia, setReimburseVia] = React.useState<ClaimReimburseVia>("DIRECT");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateClaim();
  const usersQuery = useUsersLookup();

  function resetForm() {
    setStaffUserId("");
    setReimburseVia("DIRECT");
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

  const canSubmit = !!staffUserId && !!reimburseVia && !createMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: CreateClaimDto = { staffUserId, reimburseVia };
    try {
      const created = await createMutation.mutateAsync(dto);
      setOpen(false);
      router.push(`/expenses/claims/${created.id}`);
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
            <Label required>{t("staffLabel")}</Label>
            <Combobox
              items={staffItems}
              value={staffUserId}
              onChange={setStaffUserId}
              placeholder={usersQuery.isLoading ? t("loadingUsers") : t("selectStaffPlaceholder")}
              searchPlaceholder={t("searchUsers")}
              emptyText={t("noUsersFound")}
              disabled={usersQuery.isLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("reimburseViaLabel")}</Label>
            <Select value={reimburseVia} onValueChange={(v) => setReimburseVia(v as ClaimReimburseVia)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLAIM_REIMBURSE_VIA.map((rv) => (
                  <SelectItem key={rv} value={rv}>
                    {tReimburseVia(rv)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("reimburseViaHint")}</p>
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

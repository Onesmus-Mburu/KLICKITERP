"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreateStoreDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useUsersLookup } from "@/features/departments/hooks/use-users-lookup";
import { useCreateStore } from "../hooks/use-stores";

const NAME_MAX_LENGTH = 120; // inv_store.name is varchar(120) — inv-store.entity.ts.
const LOCATION_MAX_LENGTH = 120; // inv_store.location is varchar(120) — inv-store.entity.ts.

/**
 * Phase 6 Slice 19 Part 1 (Inventory Foundations, Module 13) — the store
 * create form: `name`/`location` (plain text) + a REQUIRED keeper-user
 * picker (`keeperUserId` is a real FK to `usr_user`, `CreateStoreDto.keeperUserId!:
 * string`, no `?`). Reuses `features/departments/hooks/use-users-lookup.ts`
 * (this codebase's one existing "small user picker, no per-feature user list
 * needed" wrapper — checked first, per this part's own brief, rather than
 * building a duplicate `GET /users` wrapper here) via the SAME cross-feature
 * import direction `features/users/components/assign-department-dialog.tsx`
 * already established for `useDepartments()` (consume the feature that
 * shipped first, don't duplicate its data source) — mirrors
 * `create-department-dialog.tsx`'s own `${fullName} (${username})` picker
 * label shape exactly.
 *
 * Globally-unique `name` — a duplicate-name create attempt is rejected
 * server-side and surfaced via `ApiError.message`. The real rejection is a
 * raw `500` with a leaked SQL constraint-name message, not a clean 409/422
 * — a genuine backend gap confirmed live, documented in full in
 * `stores.api.ts`'s own doc comment.
 */
export function CreateStoreDialog() {
  const t = useTranslations("inventory.stores.createDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [keeperUserId, setKeeperUserId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const createMutation = useCreateStore();
  const usersQuery = useUsersLookup();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName("");
      setLocation("");
      setKeeperUserId("");
      setError(null);
    }
  }

  const keeperItems = React.useMemo(
    () => (usersQuery.data?.items ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})` })),
    [usersQuery.data],
  );
  const canSubmit = name.trim().length > 0 && location.trim().length > 0 && !!keeperUserId;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: CreateStoreDto = { name: name.trim(), location: location.trim(), keeperUserId };
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
          <div className="space-y-1.5">
            <Label required>{t("nameLabel")}</Label>
            <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("locationLabel")}</Label>
            <Input value={location} maxLength={LOCATION_MAX_LENGTH} onChange={(e) => setLocation(e.target.value)} placeholder={t("locationPlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("keeperLabel")}</Label>
            <Combobox
              items={keeperItems}
              value={keeperUserId}
              onChange={setKeeperUserId}
              placeholder={usersQuery.isLoading ? t("loadingUsers") : t("keeperPlaceholder")}
              searchPlaceholder={t("keeperSearchPlaceholder")}
              emptyText={t("keeperEmptyText")}
              disabled={usersQuery.isLoading}
            />
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

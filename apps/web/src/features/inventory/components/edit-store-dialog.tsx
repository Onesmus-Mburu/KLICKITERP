"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import type { StoreResponseDto, UpdateStoreDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useUsersLookup } from "@/features/departments/hooks/use-users-lookup";
import { useUpdateStore } from "../hooks/use-stores";

const NAME_MAX_LENGTH = 120; // inv_store.name is varchar(120) — inv-store.entity.ts.
const LOCATION_MAX_LENGTH = 120; // inv_store.location is varchar(120) — inv-store.entity.ts.

/**
 * Phase 6 Slice 19 Part 1 (Inventory Foundations, Module 13) — a plain
 * multi-field diff (`name`/`location`/`keeperUserId`), the same shape
 * `edit-cost-center-dialog.tsx` establishes. `keeperUserId` is NOT nullable
 * on `UpdateStoreDto` (`keeperUserId?: string`, no `| null`) — unlike the
 * category parent picker, there is no "clear to none" affordance here, only
 * reassignment to a different real user. `isActive` is intentionally NOT
 * editable from this dialog — it's this part's own dedicated
 * activate/deactivate toggle on the list page (`app/(erp)/inventory/stores/page.tsx`,
 * the same direct-click toggle shape `cost-centers/page.tsx` already
 * established), matching that page's own separation of concerns rather than
 * bundling status into the same form as the descriptive fields.
 */
export function EditStoreDialog({ store }: { store: StoreResponseDto }) {
  const t = useTranslations("inventory.stores.editDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(store.name);
  const [location, setLocation] = React.useState(store.location);
  const [keeperUserId, setKeeperUserId] = React.useState(store.keeperUserId);
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateStore();
  const usersQuery = useUsersLookup();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName(store.name);
      setLocation(store.location);
      setKeeperUserId(store.keeperUserId);
      setError(null);
    }
  }

  const keeperItems = React.useMemo(() => {
    const items = (usersQuery.data?.items ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})` }));
    if (store.keeperUserId && !items.some((i) => i.value === store.keeperUserId)) {
      items.push({ value: store.keeperUserId, label: store.keeperUserId });
    }
    return items;
  }, [usersQuery.data, store.keeperUserId]);

  const canSubmit = name.trim().length > 0 && location.trim().length > 0 && !!keeperUserId;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: UpdateStoreDto = {};
    if (name.trim() !== store.name) dto.name = name.trim();
    if (location.trim() !== store.location) dto.location = location.trim();
    if (keeperUserId !== store.keeperUserId) dto.keeperUserId = keeperUserId;
    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: store.id, dto });
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
          <DialogTitle>{t("title", { name: store.name })}</DialogTitle>
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
            <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("locationLabel")}</Label>
            <Input value={location} maxLength={LOCATION_MAX_LENGTH} onChange={(e) => setLocation(e.target.value)} />
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
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || updateMutation.isPending}>
            {updateMutation.isPending ? t("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

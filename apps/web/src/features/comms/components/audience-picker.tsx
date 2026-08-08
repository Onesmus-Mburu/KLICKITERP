"use client";

import { useTranslations } from "next-intl";
import type { AudienceDefDto } from "@klickit/contracts";
import { Label } from "@/components/ui/label";
import { MultiSelect, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRoles } from "@/features/roles/hooks/use-roles";
import { useUsersLookup } from "../hooks/use-users-lookup";

// Same literal order as `AUDIENCE_KINDS` (`audience-def.dto.ts`) — the ONLY
// two real audience kinds `BroadcastsService.resolveUsers()`'s exhaustive
// switch understands today; guardian/parent kinds are deferred to Module 8
// (Students) and throw a `ValidationException` server-side, so they are
// deliberately NOT offered here.
const AUDIENCE_KINDS: AudienceDefDto["kind"][] = ["STAFF_ROLE", "EXPLICIT_USER_IDS"];

/**
 * Local, dialog-owned shape — NOT `AudienceDefDto` itself, since a real
 * `AudienceDefDto` only ever carries ONE of `roleId`/`userIds` at a time
 * (conditionally required by `kind`, per `audience-def.dto.ts`'s own doc
 * comment), while this picker needs to keep BOTH around in local state so
 * switching `kind` back and forth doesn't lose whatever the admin already
 * picked in the other mode. `create-broadcast-dialog.tsx` converts this down
 * to a real `AudienceDefDto` (only the field matching the current `kind`) at
 * submit time.
 */
export interface AudiencePickerValue {
  kind: AudienceDefDto["kind"];
  roleId: string;
  userIds: string[];
}

export const EMPTY_AUDIENCE_PICKER_VALUE: AudiencePickerValue = { kind: "STAFF_ROLE", roleId: "", userIds: [] };

/**
 * `kind` `<Select>` (reused directly, per this part's plan) + conditionally
 * either the `STAFF_ROLE` role `<Select>` (options from `useRoles()`, the
 * SAME cross-feature reuse `features/users/hooks/use-users.ts`/
 * `features/departments/hooks/use-departments.ts`/`features/users/components/
 * user-roles-section.tsx` already establish — not a new pattern) or the
 * `EXPLICIT_USER_IDS` user `<MultiSelect>` (options from this feature's own
 * `useUsersLookup()`, mirroring `departments/components/*-dialog.tsx`'s
 * head-of-department picker).
 */
export function AudiencePicker({ value, onChange }: { value: AudiencePickerValue; onChange: (next: AudiencePickerValue) => void }) {
  const t = useTranslations("communications.broadcasts.audiencePicker");
  const rolesQuery = useRoles();
  const usersQuery = useUsersLookup();

  const roleOptions = rolesQuery.data ?? [];
  const userOptions = (usersQuery.data?.items ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})` }));

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label required>{t("kindLabel")}</Label>
        <Select value={value.kind} onValueChange={(kind) => onChange({ ...value, kind: kind as AudienceDefDto["kind"] })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUDIENCE_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {t(`kinds.${kind}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {value.kind === "STAFF_ROLE" ? (
        <div className="space-y-1.5">
          <Label required>{t("roleLabel")}</Label>
          <Select value={value.roleId} onValueChange={(roleId) => onChange({ ...value, roleId })} disabled={rolesQuery.isPending}>
            <SelectTrigger>
              <SelectValue placeholder={t("rolePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label required>{t("usersLabel")}</Label>
          <MultiSelect
            options={userOptions}
            selected={value.userIds}
            onChange={(userIds) => onChange({ ...value, userIds })}
            placeholder={t("usersPlaceholder")}
            disabled={usersQuery.isPending}
          />
        </div>
      )}
    </div>
  );
}

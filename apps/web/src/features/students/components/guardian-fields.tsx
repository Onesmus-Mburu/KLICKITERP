"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Shared "new guardian" field group — Phase 6 Slice 2b items 1/2b/3/4.
 * Used by BOTH `guardian-link-dialog.tsx`'s "new guardian" tab AND
 * `student-form.tsx`'s new inline "Guardian / Parent Information" section
 * (item 1), so the relationship dropdown / required-asterisks / phone-optional
 * / either-or-contact hint are all correct in exactly one place instead of
 * two independently-maintained copies.
 */
export interface GuardianFieldsValue {
  fullName: string;
  phone: string;
  email: string;
  nationalId: string;
  relationship: string;
  isPrimary: boolean;
  receivesBilling: boolean;
}

export const EMPTY_GUARDIAN_FIELDS: GuardianFieldsValue = {
  fullName: "",
  phone: "",
  email: "",
  nationalId: "",
  relationship: "",
  isPrimary: false,
  receivesBilling: true,
};

/** True when every field is untouched — `student-form.tsx` uses this to decide whether the (optional) guardian section was filled in at all. */
export function isGuardianFieldsEmpty(v: GuardianFieldsValue): boolean {
  return !v.fullName.trim() && !v.phone.trim() && !v.email.trim() && !v.nationalId.trim() && !v.relationship.trim();
}

/**
 * Phase 6 Slice 2b item 4 — client-side mirror of `GuardiansService.create()`'s
 * server-side "phone or email" rule (see that service's doc comment), for
 * immediate feedback before hitting the network. Verified against the real
 * `CreateGuardianDtoSchema` (`phone`/`email` both `.optional()` now) — this
 * is a UX guard layered on top of, not a substitute for, the real server
 * CHECK constraint (`ck_std_guardian_contact`, migration `0200`).
 */
export function hasGuardianContact(v: GuardianFieldsValue): boolean {
  return v.phone.trim().length > 0 || v.email.trim().length > 0;
}

/** Phase 6 Slice 2b item 2b — free-text `relationship` (backend stays `string`, verified against the real `LinkGuardianDto`) constrained to a frontend convention list via `<Select>` instead of a free-text `<Input>`. */
const RELATIONSHIP_CODES = ["FATHER", "MOTHER", "GUARDIAN", "SPONSOR"] as const;

export function GuardianFields({
  value,
  onChange,
  fieldErrors,
  showContactHint,
}: {
  value: GuardianFieldsValue;
  onChange: (next: GuardianFieldsValue) => void;
  fieldErrors?: Record<string, string>;
  /** Show the either-or contact hint even before phone/email are touched — the dialog's "new guardian" tab always requires a contact; the student-form section only requires one once ANY field is filled (it's optional as a whole). */
  showContactHint?: boolean;
}) {
  const t = useTranslations("students.guardianDialog");
  const errors = fieldErrors ?? {};
  const contactOk = hasGuardianContact(value);

  function set<K extends keyof GuardianFieldsValue>(key: K, v: GuardianFieldsValue[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label required>{t("fullName")}</Label>
          <Input value={value.fullName} onChange={(e) => set("fullName", e.target.value)} maxLength={120} required />
          {errors.fullName && <p className="text-xs text-destructive">{errors.fullName}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>{t("phone")}</Label>
          <Input value={value.phone} onChange={(e) => set("phone", e.target.value)} maxLength={20} />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>{t("email")}</Label>
          <Input type="email" value={value.email} onChange={(e) => set("email", e.target.value)} maxLength={160} />
          {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("nationalId")}</Label>
          <Input value={value.nationalId} onChange={(e) => set("nationalId", e.target.value)} maxLength={20} />
        </div>
      </div>

      {(showContactHint || value.phone || value.email) && !contactOk && (
        <p className="text-xs text-destructive">{t("contactRequired")}</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label required>{t("relationship")}</Label>
          <Select value={value.relationship} onValueChange={(v) => set("relationship", v)}>
            <SelectTrigger>
              <SelectValue placeholder={t("selectRelationship")} />
            </SelectTrigger>
            <SelectContent>
              {RELATIONSHIP_CODES.map((code) => (
                <SelectItem key={code} value={code}>
                  {t(`relationshipOptions.${code}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.relationship && <p className="text-xs text-destructive">{errors.relationship}</p>}
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={value.isPrimary} onChange={(e) => set("isPrimary", e.target.checked)} className="size-4 rounded border-input" />
          {t("isPrimary")}
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={value.receivesBilling} onChange={(e) => set("receivesBilling", e.target.checked)} className="size-4 rounded border-input" />
          {t("receivesBilling")}
        </label>
      </div>
    </div>
  );
}

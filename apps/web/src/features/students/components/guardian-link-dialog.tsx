"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { GuardianResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError, parseFieldErrors } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { GuardianLinkAfterCreateError, useCreateAndLinkGuardian, useGuardians, useLinkGuardian } from "../hooks/use-guardians";
import { EMPTY_GUARDIAN_FIELDS, GuardianFields, hasGuardianContact, type GuardianFieldsValue } from "./guardian-fields";

type Mode = "existing" | "new";

/** Phase 6 Slice 2b item 2b — same frontend convention list as `guardian-fields.tsx`'s `<GuardianFields>`, restated here for the "link existing" tab's own relationship `<Select>` (a separate small control, not worth extracting a whole shared component for). */
const RELATIONSHIP_CODES = ["FATHER", "MOTHER", "GUARDIAN", "SPONSOR"] as const;

/**
 * Two real paths, one dialog: link an ALREADY-existing guardian (search the
 * bulk `useGuardians()` list client-side, since `GuardiansController` has no
 * server-side search/filter param) or create-and-link a brand-new one in one
 * flow (`useCreateAndLinkGuardian` — two real, non-atomic HTTP calls, see
 * that hook's own doc comment for the recovery-error path this dialog
 * surfaces via `GuardianLinkAfterCreateError`). `admissionNo`'s 409 sibling
 * on this domain is guardian `phone` — mapped to an inline field error here,
 * not a generic banner, same discipline as `student-form.tsx`.
 *
 * Phase 6 Slice 2b: the "new guardian" field group (item 1's inline section
 * on `student-form.tsx` needed the exact same fields) now lives in the
 * shared `<GuardianFields>` component — relationship is a `<Select>` (item
 * 2b), required fields get the shared `Label required` asterisk (item 3),
 * phone is optional with a client-side either-or hint (item 4), and
 * `parseFieldErrors` (item 2a) is layered in as a fallback.
 *
 * Phase 6 Slice 2c: `POST /students/guardians` no longer 409s on a duplicate
 * phone (or any other reason — confirmed by reading `GuardiansService.create()`
 * in full: its only remaining thrown error is a 422 `ValidationException` for
 * "neither phone nor email supplied", never a `ConflictException`) — it now
 * finds-and-reuses an existing guardian instead. The old `err.status === 409
 * → fieldErrors.phone = phoneConflict` branch this dialog used to have is
 * genuinely dead code for that reason and has been removed (not merely
 * repurposed — there is no other way for this specific endpoint to 409
 * today). The "new guardian" tab now shows a real, wasExisting-aware success
 * note ("New guardian created" vs. "Linked to existing guardian {fullName}
 * — looks like a sibling!") before closing, instead of closing silently.
 */
export function GuardianLinkDialog({ studentId, open, onOpenChange }: { studentId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("students.guardianDialog");
  const tCommon = useTranslations("common");
  const [mode, setMode] = React.useState<Mode>("existing");
  const [search, setSearch] = React.useState("");
  const [selectedGuardian, setSelectedGuardian] = React.useState<GuardianResponseDto | null>(null);
  const [existingRelationship, setExistingRelationship] = React.useState("");
  const [isPrimary, setIsPrimary] = React.useState(false);
  const [receivesBilling, setReceivesBilling] = React.useState(true);
  const [newGuardian, setNewGuardian] = React.useState<GuardianFieldsValue>(EMPTY_GUARDIAN_FIELDS);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  // Phase 6 Slice 2c — set on a successful create-and-link, holding the
  // dialog open one extra beat to show which happened (new vs. reused
  // sibling guardian) instead of closing silently.
  const [successNote, setSuccessNote] = React.useState<string | null>(null);

  const guardiansQuery = useGuardians();
  const linkMutation = useLinkGuardian(studentId);
  const createAndLinkMutation = useCreateAndLinkGuardian(studentId);

  React.useEffect(() => {
    if (!open) {
      setMode("existing");
      setSearch("");
      setSelectedGuardian(null);
      setExistingRelationship("");
      setIsPrimary(false);
      setReceivesBilling(true);
      setNewGuardian(EMPTY_GUARDIAN_FIELDS);
      setFieldErrors({});
      setFormError(null);
      setSuccessNote(null);
    }
  }, [open]);

  const filteredGuardians = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = guardiansQuery.data ?? [];
    if (!q) return all;
    return all.filter((g) => g.fullName.toLowerCase().includes(q) || (g.phone ?? "").includes(q));
  }, [guardiansQuery.data, search]);

  async function handleLinkExisting() {
    setFormError(null);
    setFieldErrors({});
    if (!selectedGuardian) {
      setFormError(t("selectGuardianFirst"));
      return;
    }
    if (!existingRelationship.trim()) {
      setFieldErrors({ relationship: t("relationshipRequired") });
      return;
    }
    try {
      await linkMutation.mutateAsync({ guardianId: selectedGuardian.id, relationship: existingRelationship, isPrimary, receivesBilling });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        const parsed = parseFieldErrors(err);
        if (Object.keys(parsed).length > 0) {
          setFieldErrors(parsed);
          return;
        }
      }
      setFormError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  async function handleCreateAndLink() {
    setFormError(null);
    setFieldErrors({});
    if (!newGuardian.relationship.trim()) {
      setFieldErrors({ relationship: t("relationshipRequired") });
      return;
    }
    if (!hasGuardianContact(newGuardian)) {
      setFieldErrors({ phone: t("contactRequired") });
      return;
    }
    try {
      const result = await createAndLinkMutation.mutateAsync({
        guardianDto: {
          fullName: newGuardian.fullName,
          phone: newGuardian.phone || undefined,
          email: newGuardian.email || undefined,
          nationalId: newGuardian.nationalId || undefined,
        },
        linkDto: { relationship: newGuardian.relationship, isPrimary: newGuardian.isPrimary, receivesBilling: newGuardian.receivesBilling },
      });
      // Phase 6 Slice 2c — hold the dialog open one extra beat to show
      // whether a fresh guardian was created or an existing (sibling)
      // guardian was found and reused, instead of closing silently.
      setSuccessNote(result.wasExisting ? t("linkedToExisting", { fullName: result.guardian.fullName }) : t("newGuardianCreated"));
    } catch (err) {
      if (err instanceof GuardianLinkAfterCreateError) {
        setFormError(err.message);
        return;
      }
      // Phase 6 Slice 2c — the old `err.status === 409 -> fieldErrors.phone`
      // branch that used to live here is genuinely dead code now:
      // `GuardiansService.create()` no longer throws a ConflictException for
      // ANY reason (confirmed by reading it in full) — a duplicate
      // phone/email is now found-and-reused instead of erroring. A 400
      // validation failure (e.g. a malformed email) still falls through to
      // `parseFieldErrors` below, same as before.
      if (err instanceof ApiError) {
        const parsed = parseFieldErrors(err);
        if (Object.keys(parsed).length > 0) {
          setFieldErrors(parsed);
          return;
        }
      }
      setFormError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  const pending = linkMutation.isPending || createAndLinkMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "existing" ? t("titleLink") : t("titleCreate")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {successNote ? (
          // Phase 6 Slice 2c — a successful create-and-link holds the dialog
          // open one extra beat to show whether a fresh guardian was created
          // or an existing (sibling) guardian was found and reused, instead
          // of closing silently. The tab switcher/form are hidden here —
          // nothing left to edit, "Done" (below) is the only action.
          <Alert variant="success">
            <AlertDescription>{successNote}</AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={mode === "existing" ? "default" : "outline"} onClick={() => setMode("existing")}>
                {t("tabExisting")}
              </Button>
              <Button type="button" size="sm" variant={mode === "new" ? "default" : "outline"} onClick={() => setMode("new")}>
                {t("tabNew")}
              </Button>
            </div>

            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
          </>
        )}

        {!successNote && mode === "existing" ? (
          <div className="space-y-3">
            <Input placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
              {filteredGuardians.map((g) => (
                <button
                  type="button"
                  key={g.id}
                  onClick={() => setSelectedGuardian(g)}
                  className={cn(
                    "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted",
                    selectedGuardian?.id === g.id && "bg-tint-primary",
                  )}
                >
                  <span className="font-medium text-foreground">{g.fullName}</span>
                  <span className="text-xs text-muted-foreground">{g.phone ?? g.email ?? "—"}</span>
                </button>
              ))}
              {filteredGuardians.length === 0 && <p className="p-3 text-xs text-muted-foreground">{t("noResults")}</p>}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label required>{t("relationship")}</Label>
                <Select value={existingRelationship} onValueChange={setExistingRelationship}>
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
                {fieldErrors.relationship && <p className="text-xs text-destructive">{fieldErrors.relationship}</p>}
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} className="size-4 rounded border-input" />
                {t("isPrimary")}
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={receivesBilling} onChange={(e) => setReceivesBilling(e.target.checked)} className="size-4 rounded border-input" />
                {t("receivesBilling")}
              </label>
            </div>
          </div>
        ) : !successNote ? (
          <GuardianFields value={newGuardian} onChange={setNewGuardian} fieldErrors={fieldErrors} showContactHint />
        ) : null}

        <DialogFooter>
          {successNote ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              {t("done")}
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="button" onClick={mode === "existing" ? handleLinkExisting : handleCreateAndLink} disabled={pending}>
                {pending ? t("submitting") : mode === "existing" ? t("submitLink") : t("submitCreate")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

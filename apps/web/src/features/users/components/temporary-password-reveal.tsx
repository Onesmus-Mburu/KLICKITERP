"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import type { UserResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const COPIED_RESET_MS = 3000;

/**
 * Phase 6 Slice 13 Part 4 — the first server-generated-secret-shown-once UI
 * anywhere in this codebase (no existing component does exactly this;
 * `guardian-link-dialog.tsx`'s `successNote` pattern is the closest
 * structural relative — a success state that HOLDS instead of closing
 * silently — but this escalates it deliberately, per the plan's own explicit
 * instruction):
 *
 *  - A prominent, unmissable `<Alert variant="warning">` permanence warning —
 *    this password will never be shown again after this screen.
 *  - The real `temporaryPassword` in a monospace, `readOnly`, click-to-select
 *    `<Input>`, plus an explicit copy-to-clipboard `<Button>` that visibly
 *    confirms ("Copied") for a few seconds after a successful copy.
 *  - **No automatic navigation, ever.** The only way off this screen is the
 *    explicit "I've saved this password — Go to user" button, which then
 *    navigates to `/users/[id]`. No toast-and-redirect, no timer-based
 *    auto-close — the admin must make a deliberate choice to leave.
 *
 * The `temporaryPassword` prop is sourced directly from `useCreateUser()`'s
 * one-time mutation response (see that hook's own doc comment) and lives
 * ONLY in the parent create-user page's local React state — this component
 * never persists it anywhere itself either (no local state copy beyond the
 * transient "was it just copied" UI flag, no effect writing it to any
 * store). It is gone the moment the admin navigates away.
 */
export function TemporaryPasswordReveal({ user, temporaryPassword }: { user: UserResponseDto; temporaryPassword: string }) {
  const t = useTranslations("users.newPage.reveal");
  const router = useRouter();
  const [copied, setCopied] = React.useState(false);
  const resetTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(resetTimerRef.current), []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      // Clipboard access can fail (insecure context, permission denied) —
      // the password is still fully visible/selectable in the input below,
      // so this is a degraded-but-still-usable path, not a dead end.
    }
  }

  return (
    <div className="space-y-4">
      <Alert variant="warning">
        <AlertTitle>{t("warningTitle")}</AlertTitle>
        <AlertDescription>{t("warningDescription")}</AlertDescription>
      </Alert>

      <div className="space-y-1.5">
        <Label>{t("usernameLabel")}</Label>
        <p className="text-sm font-medium text-foreground">{user.username}</p>
      </div>

      <div className="space-y-1.5">
        <Label>{t("passwordLabel")}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            readOnly
            value={temporaryPassword}
            onFocus={(e) => e.target.select()}
            className="font-mono"
            aria-label={t("passwordLabel")}
          />
          <Button type="button" variant="outline" onClick={() => void handleCopy()} className="shrink-0">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? t("copied") : t("copy")}
          </Button>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <Button type="button" onClick={() => router.push(`/users/${user.id}`)} className="w-full sm:w-auto">
          {t("goToUser")}
        </Button>
      </div>
    </div>
  );
}

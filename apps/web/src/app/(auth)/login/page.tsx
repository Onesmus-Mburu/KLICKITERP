"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LoginDtoSchema, TwoFactorVerifyDtoSchema } from "@klickit/contracts";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Reveal } from "@/components/patterns/reveal";
import { useLogin, useVerify2fa } from "@/hooks/use-auth";
import { establishSession } from "@/lib/session-api";
import { ApiError } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import type { PublicUser } from "@/lib/auth-types";

/** Slice 1.5b (visual polish iteration): the countdown pill switches to the destructive tint in its final 15s — the same real `secondsLeft` state already driving the submit button's `disabled` prop, just also read here for color, not a second timer. */
const COUNTDOWN_URGENT_THRESHOLD_SECONDS = 15;

/** Server-configured pre-auth token lifetime (`AppConfigService.preauthTokenTtlSeconds`, docs/phase-6/PROGRESS.md: "Pre-auth window is 90s"). Kept in sync manually — no runtime way for apps/web to read it from the backend. */
const PREAUTH_TTL_SECONDS = 90;

type Step = "credentials" | "2fa";

export default function LoginPage() {
  const t = useTranslations("auth.login");
  const t2fa = useTranslations("auth.twoFactor");
  const router = useRouter();
  const loginMutation = useLogin();
  const verify2faMutation = useVerify2fa();

  const [step, setStep] = React.useState<Step>("credentials");
  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  // Pre-auth token deliberately kept ONLY in component state (React
  // memory), never the URL/query string/localStorage — per
  // docs/phase-6/PROGRESS.md scope item 5's explicit requirement.
  const [preauthToken, setPreauthToken] = React.useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = React.useState(PREAUTH_TTL_SECONDS);
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (step !== "2fa") return;
    setSecondsLeft(PREAUTH_TTL_SECONDS);
    const interval = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  async function afterLoginComplete(user: PublicUser | undefined, accessToken: string | undefined, refreshToken: string | undefined, mustChangePassword: boolean | undefined) {
    if (!user || !accessToken || !refreshToken) {
      setFormError(t("genericError"));
      return;
    }
    await establishSession({ accessToken, refreshToken, user, mustChangePassword: !!mustChangePassword });
    router.push(mustChangePassword ? "/change-password" : "/dashboard");
  }

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = LoginDtoSchema.safeParse({ identifier, password });
    if (!parsed.success) {
      setFormError(t("invalidCredentials"));
      return;
    }
    try {
      const outcome = await loginMutation.mutateAsync(parsed.data);
      if (outcome.stage === "2fa" && outcome.preauthToken) {
        setPreauthToken(outcome.preauthToken);
        setStep("2fa");
        return;
      }
      await afterLoginComplete(outcome.user, outcome.accessToken, outcome.refreshToken, outcome.mustChangePassword);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setFormError(t("invalidCredentials"));
      } else {
        setFormError(t("genericError"));
      }
    }
  }

  async function handle2faSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!preauthToken || secondsLeft <= 0) {
      setFormError(t2fa("expired"));
      return;
    }
    const parsed = TwoFactorVerifyDtoSchema.safeParse({ preauthToken, code });
    if (!parsed.success) {
      setFormError(t2fa("invalidCode"));
      return;
    }
    try {
      const outcome = await verify2faMutation.mutateAsync(parsed.data);
      await afterLoginComplete(outcome.user, outcome.accessToken, outcome.refreshToken, outcome.mustChangePassword);
    } catch {
      setFormError(t2fa("invalidCode"));
    }
  }

  function backToLogin() {
    setStep("credentials");
    setPreauthToken(null);
    setCode("");
    setFormError(null);
  }

  if (step === "2fa") {
    const urgent = secondsLeft > 0 && secondsLeft <= COUNTDOWN_URGENT_THRESHOLD_SECONDS;
    return (
      <Reveal>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-foreground">{t2fa("title")}</CardTitle>
            <CardDescription>{t2fa("subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handle2faSubmit} className="space-y-5">
              {formError && (
                <Alert variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="code">{t2fa("codeLabel")}</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="text-center text-lg tracking-[0.4em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  required
                />
              </div>
              {/* Slice 1.5b (visual polish iteration): the countdown was a
                  bare `text-xs text-muted-foreground` line — same real
                  `secondsLeft` state, now a legible tinted pill (icon +
                  tabular-nums so the digits don't jitter the pill's width
                  every second) that turns destructive-toned in its final
                  15s, still driven by the exact same countdown effect
                  above, no new timer/logic added. */}
              <div
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium tabular-nums",
                  secondsLeft <= 0 || urgent ? "bg-tint-destructive text-destructive" : "bg-tint-primary text-primary",
                )}
                data-testid="preauth-countdown"
              >
                <Clock className="size-4" />
                {secondsLeft > 0 ? t2fa("expiresIn", { seconds: secondsLeft }) : t2fa("expired")}
              </div>
              <Button type="submit" className="w-full" disabled={verify2faMutation.isPending || secondsLeft <= 0}>
                {verify2faMutation.isPending ? t2fa("submitting") : t2fa("submit")}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={backToLogin}>
                {t2fa("backToLogin")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </Reveal>
    );
  }

  return (
    <Reveal>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-foreground">{t("title")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCredentialsSubmit} className="space-y-5">
            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="identifier">{t("identifierLabel")}</Label>
              <Input id="identifier" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("passwordLabel")}</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? t("submitting") : t("submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Reveal>
  );
}

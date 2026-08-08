"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { ApiError } from "@/lib/api-error";
import { useAdmissionNoAutogenSetting, useSetAdmissionNoAutogenSetting } from "../hooks/use-admission-no-autogen";

/**
 * Phase 6 Slice 2b item 8 — the "Admission Number Settings" panel on the
 * Classes & Streams management page: a toggle + prefix text input calling
 * `GET/PUT /students/settings/admission-no-autogen`. Its own
 * `<QueryBoundary>` instance (same per-widget-isolation discipline every
 * other section of this app already follows) so a failure here doesn't
 * blank the Classes/Streams tables sharing this page.
 */
export function AdmissionNoAutogenPanel() {
  const t = useTranslations("students.classesPage.admissionAutogen");
  const settingQuery = useAdmissionNoAutogenSetting();
  const setMutation = useSetAdmissionNoAutogenSetting();
  const [enabled, setEnabled] = React.useState(false);
  const [prefix, setPrefix] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const hydrated = React.useRef(false);

  React.useEffect(() => {
    if (settingQuery.data && !hydrated.current) {
      hydrated.current = true;
      setEnabled(settingQuery.data.enabled);
      setPrefix(settingQuery.data.prefix);
    }
  }, [settingQuery.data]);

  async function handleSave() {
    setError(null);
    setSaved(false);
    try {
      await setMutation.mutateAsync({ enabled, prefix });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </CardHeader>
      <CardContent>
        <QueryBoundary query={settingQuery}>
          {() => (
            <div className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {saved && !error && (
                // No "success" Alert variant exists (`alert.tsx` only defines
                // default/destructive/warning) — a plain `text-success` line
                // (a real token, `--success`) reuses the existing token
                // system rather than inventing a new Alert variant for one
                // call site.
                <p className="text-sm font-medium text-success">{t("saved")}</p>
              )}

              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => {
                    setEnabled(e.target.checked);
                    setSaved(false);
                  }}
                  className="size-4 rounded border-input"
                />
                {t("enableLabel")}
              </label>

              <div className="max-w-xs space-y-1.5">
                <Label>{t("prefixLabel")}</Label>
                <Input
                  value={prefix}
                  onChange={(e) => {
                    setPrefix(e.target.value);
                    setSaved(false);
                  }}
                  maxLength={12}
                  placeholder={t("prefixPlaceholder")}
                />
                <p className="text-xs text-muted-foreground">{t("prefixHint")}</p>
              </div>

              <Button type="button" onClick={handleSave} disabled={setMutation.isPending}>
                {setMutation.isPending ? t("saving") : t("save")}
              </Button>
            </div>
          )}
        </QueryBoundary>
      </CardContent>
    </Card>
  );
}

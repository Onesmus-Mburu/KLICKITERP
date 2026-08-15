"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileWarning } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/components/patterns/data-table";
import { ApiError } from "@/lib/api-error";
import { useAccounts as useBankAccounts } from "../hooks/use-accounts";
import { useImportStatement, useMostRecentStatementImport, useUploadStatementFile } from "../hooks/use-statement-import";
import type { StatementMappingTemplate } from "../hooks/use-statement-import";
import { parseCsv } from "../lib/csv-parser";
import { ColumnMappingForm, emptyMappingTemplate, isMappingComplete } from "./column-mapping-form";
import { ImportResultSummary } from "./import-result-summary";

const PREVIEW_ROW_LIMIT = 20;

type Step = "account" | "upload" | "preview" | "mapping" | "confirm" | "result";
const STEP_ORDER: Step[] = ["account", "upload", "preview", "mapping", "confirm", "result"];

/**
 * Phase 6 Slice 21 Part 3 (Statement Import, Module 16) — the multi-step
 * import flow: pick account -> upload file -> preview parsed rows -> map
 * columns -> confirm import -> result. A DEDICATED PAGE (`app/(erp)/banking/statement-imports/new/page.tsx`
 * renders this), not a `<Dialog>` — matching `journal-entry-form.tsx`'s
 * (Accounting, Slice 17 Part 2) own precedent: a genuinely multi-row/wide
 * flow (a full-width CSV preview table, a 6+ field mapping form) reads far
 * better with a full page's width than cramped inside a `<Dialog>`'s
 * max-width content area. Named `-form.tsx`, not `-dialog.tsx` (the plan's
 * own illustrative filename), for the same reason `journal-entry-form.tsx`
 * itself isn't `create-journal-dialog.tsx` — it isn't one.
 *
 * **This endpoint does NOT parse files server-side** — `lib/csv-parser.ts`'s
 * own small RFC4180-aware parser does the real work client-side, and only
 * plain CSV is accepted (`accept=".csv,text/csv"` on the upload step's file
 * input) — a deliberate, honest scope boundary, not an oversight: a real
 * `.xlsx` binary workbook is a genuinely different parsing problem
 * (`features/students/lib/bulk-import-xlsx.ts`'s own `xlsx`/SheetJS
 * dependency solves THAT one, for a completely different domain), and the
 * task's own brief was explicit that this feature gets a small, purpose-built
 * CSV parser, not a second binary-format dependency.
 *
 * **No "saved mapping template" feature** — no such entity exists
 * server-side (confirmed by reading `BankStatementImportRepository`
 * directly: create/list/findOne only, no update/delete, no separate template
 * CRUD anywhere in `BankingModule`). Instead, the mapping step offers a real,
 * honest convenience: prefilling from the ACCOUNT's own most recent prior
 * import (`useMostRecentStatementImport()`, `GET /banking/statement-imports?accountId=`'s
 * own newest-first ordering) — never described as a "saved template" in this
 * file's own copy or i18n keys, since there's nowhere a template is actually
 * persisted independent of a real past import.
 *
 * **Upload happens as soon as a file is chosen** (in the "upload" step,
 * before the user even reaches "confirm") — `uploadStatementFile()` (a real
 * `POST /files` multipart call) fires in parallel with the CSV being parsed
 * client-side, so the real `fileId` is usually already resolved by the time
 * the user reaches "confirm." The "confirm" step's own Import button stays
 * disabled with an honest "still uploading" hint for the rare case the
 * upload is still in flight (a slow connection, a large file) rather than
 * silently blocking with no explanation.
 */
export function ImportStatementForm() {
  const t = useTranslations("banking.statementImports.new");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [step, setStep] = React.useState<Step>("account");
  const [accountId, setAccountId] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [fileId, setFileId] = React.useState<string | null>(null);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<Array<Record<string, unknown>>>([]);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [mapping, setMapping] = React.useState<StatementMappingTemplate>(emptyMappingTemplate);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ importId: string; insertedCount: number; duplicateCount: number } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const accountsQuery = useBankAccounts({ isActive: true });
  const priorImportQuery = useMostRecentStatementImport(accountId || undefined);
  const uploadMutation = useUploadStatementFile();
  const importMutation = useImportStatement();

  const selectedAccount = accountsQuery.data?.find((a) => a.id === accountId);
  const accountItems = React.useMemo(
    () => (accountsQuery.data ?? []).map((a) => ({ value: a.id, label: a.bankName ? `${a.name} — ${a.bankName}` : a.name })),
    [accountsQuery.data],
  );

  function goTo(next: Step) {
    setStep(next);
  }

  function back() {
    const index = STEP_ORDER.indexOf(step);
    if (index > 0) setStep(STEP_ORDER[index - 1]);
  }

  function resetToStart() {
    setStep("account");
    setFile(null);
    setFileId(null);
    setUploadError(null);
    setHeaders([]);
    setRows([]);
    setParseError(null);
    setMapping(emptyMappingTemplate());
    setSubmitError(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileChosen(chosen: File) {
    setFile(chosen);
    setFileId(null);
    setUploadError(null);
    setParseError(null);
    setHeaders([]);
    setRows([]);

    try {
      const text = await chosen.text();
      const parsed = parseCsv(text);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setParseError(t("upload.emptyFileError"));
      } else {
        setHeaders(parsed.headers);
        setRows(parsed.rows);
      }
    } catch {
      setParseError(t("upload.parseError"));
    }

    uploadMutation.mutate(chosen, {
      onSuccess: (uploaded) => setFileId(uploaded.id),
      onError: (err) => setUploadError(err instanceof ApiError ? err.message : t("upload.uploadError")),
    });
  }

  function applyPriorMapping() {
    if (priorImportQuery.data) setMapping(priorImportQuery.data.mappingTemplate);
  }

  async function handleImport() {
    if (!fileId) return;
    setSubmitError(null);
    try {
      const res = await importMutation.mutateAsync({ accountId, fileId, mappingTemplate: mapping, rawRows: rows });
      setResult(res);
      setStep("result");
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : t("confirm.genericError"));
    }
  }

  const previewColumns = React.useMemo<ColumnDef<Record<string, unknown>>[]>(
    () => headers.map((h) => ({ id: h, header: h, cell: ({ row }) => String(row.original[h] ?? "") })),
    [headers],
  );

  const stepIndex = STEP_ORDER.indexOf(step) + 1;

  return (
    <div className="space-y-6">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("stepIndicator", { current: stepIndex, total: STEP_ORDER.length, label: t(`steps.${step}`) })}
      </p>

      {step === "account" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("account.title")}</CardTitle>
            <CardDescription>{t("account.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label required>{t("account.accountLabel")}</Label>
              <Combobox
                items={accountItems}
                value={accountId}
                onChange={setAccountId}
                placeholder={accountsQuery.isLoading ? t("account.loadingAccounts") : t("account.selectAccountPlaceholder")}
                searchPlaceholder={t("account.searchAccounts")}
                emptyText={t("account.noAccountsFound")}
                disabled={accountsQuery.isLoading}
              />
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={() => goTo("upload")} disabled={!accountId}>
                {tCommon("next")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("upload.title")}</CardTitle>
            <CardDescription>{t("upload.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {parseError && (
              <Alert variant="destructive">
                <FileWarning />
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            )}
            {uploadError && (
              <Alert variant="destructive">
                <AlertDescription>{uploadError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label required>{t("upload.fileLabel")}</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const chosen = e.target.files?.[0];
                  if (chosen) void handleFileChosen(chosen);
                }}
              />
              <p className="text-xs text-muted-foreground">{t("upload.csvOnlyHint")}</p>
            </div>
            {headers.length > 0 && !parseError && (
              <Alert variant="success">
                <AlertDescription>{t("upload.parsedSummary", { rows: rows.length, columns: headers.length })}</AlertDescription>
              </Alert>
            )}
            {uploadMutation.isPending && <p className="text-xs text-muted-foreground">{t("upload.uploading")}</p>}
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={back}>
                {tCommon("back")}
              </Button>
              <Button type="button" onClick={() => goTo("preview")} disabled={headers.length === 0 || rows.length === 0 || !!parseError}>
                {tCommon("next")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "preview" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("preview.title")}</CardTitle>
            <CardDescription>
              {rows.length > PREVIEW_ROW_LIMIT
                ? t("preview.truncatedNote", { shown: PREVIEW_ROW_LIMIT, total: rows.length })
                : t("preview.rowCount", { count: rows.length })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <DataTable columns={previewColumns} data={rows.slice(0, PREVIEW_ROW_LIMIT)} />
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={back}>
                {tCommon("back")}
              </Button>
              <Button type="button" onClick={() => goTo("mapping")}>
                {tCommon("next")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "mapping" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("mapping.title")}</CardTitle>
            <CardDescription>{t("mapping.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {priorImportQuery.data && (
              <Alert>
                <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                  <span>{t("mapping.prefillHint", { date: new Date(priorImportQuery.data.importedAt).toLocaleDateString() })}</span>
                  <Button type="button" size="sm" variant="outline" onClick={applyPriorMapping}>
                    {t("mapping.prefillButton")}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            <ColumnMappingForm headers={headers} value={mapping} onChange={setMapping} />
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={back}>
                {tCommon("back")}
              </Button>
              <Button type="button" onClick={() => goTo("confirm")} disabled={!isMappingComplete(mapping)}>
                {tCommon("next")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "confirm" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("confirm.title")}</CardTitle>
            <CardDescription>{t("confirm.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("confirm.accountLabel")}</p>
                <p className="text-sm text-foreground">{selectedAccount?.name ?? accountId}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("confirm.fileLabel")}</p>
                <p className="text-sm text-foreground">{file?.name}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("confirm.rowCountLabel")}</p>
                <p className="text-sm text-foreground">{rows.length}</p>
              </div>
            </div>

            <div className="space-y-1.5 rounded-lg border border-border p-3 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("confirm.mappingRecapTitle")}</p>
              <p>
                {t("confirm.mappingRecapDate", { column: mapping.columnMap.date, format: mapping.dateFormat })}
              </p>
              <p>{t("confirm.mappingRecapDescription", { column: mapping.columnMap.description })}</p>
              <p>
                {mapping.debitCreditConvention === "SEPARATE_COLUMNS"
                  ? t("confirm.mappingRecapSeparate", { debit: mapping.columnMap.debit ?? "", credit: mapping.columnMap.credit ?? "" })
                  : t("confirm.mappingRecapSigned", { column: mapping.columnMap.amount ?? "" })}
              </p>
              {mapping.columnMap.ref && <p>{t("confirm.mappingRecapRef", { column: mapping.columnMap.ref })}</p>}
            </div>

            <Alert>
              <AlertDescription>{t("confirm.dedupeNote")}</AlertDescription>
            </Alert>

            {!fileId && !uploadError && (
              <p className="text-xs text-muted-foreground">{t("confirm.uploadingFileHint")}</p>
            )}
            {uploadError && (
              <Alert variant="destructive">
                <AlertDescription>{uploadError}</AlertDescription>
              </Alert>
            )}
            {submitError && (
              <Alert variant="destructive">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={back}>
                {tCommon("back")}
              </Button>
              <Button type="button" onClick={() => void handleImport()} disabled={!fileId || importMutation.isPending}>
                {importMutation.isPending ? t("confirm.importing") : t("confirm.importButton")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "result" && result && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <ImportResultSummary insertedCount={result.insertedCount} duplicateCount={result.duplicateCount} />
            {rows.length > 0 && (
              <Badge variant="soft-secondary" className="w-fit">
                {t("result.rowsSubmitted", { count: rows.length })}
              </Badge>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              <Button type="button" variant="outline" onClick={resetToStart}>
                {t("result.newImportButton")}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push("/banking/statement-imports")}>
                {t("result.backToListButton")}
              </Button>
              <Button type="button" onClick={() => router.push(`/banking/statement-imports/${result.importId}`)}>
                {t("result.viewImportButton")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
